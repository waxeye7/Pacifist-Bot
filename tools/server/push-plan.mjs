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

/**
 * ---------------------------------------------------------------------------
 * ROAD STAGING — the planner's own schedule, shipped instead of thrown away.
 *
 * `plan.meta.roadLayer` tags every road tile with the pipeline pass that laid
 * it (1 = the eco kit — hub, spawns, sources, controller · 3 = tower spurs ·
 * 4 = lab access · 5 = the mineral run · 6 = extension corridors · 7 = rampart
 * spurs). The payload shipped `structures` and nothing else, so the bot fell
 * back to a schedule of its own — "first 20 by BFS distance at RCL3, all of
 * them at RCL4" — which spends RCL3 on hub filler and leaves the hub->source
 * and hub->controller lines unpaved. Measured over the 172-room fleet snapshot
 * in out-v2/plans-hub.json, the arterial set this function produces is 35 tiles
 * in E16S1, 53 in E12S9, 45 in E9S2 — median 39, max 85 of E12S6's 123 —
 * against a 20-tile prefix, at the level where a hauler walks them every tick.
 *
 * WHAT IS SHIPPED: `roadStage`, a parallel int array in the same order and of
 * the same length as `structures.road`, holding the RCL each tile is wanted at.
 * Not a `{"x,y": layer}` object — the consumer stores this in
 * room.memory.planV2, which is JSON-parsed and re-serialised EVERY TICK, so the
 * unpacked form (`"12,34":6,` — 10 bytes) would cost five times as much as
 * `3,` for the same schedule, forever. Measured over
 * the fleet: +174 bytes on the median room, +260 on the largest (E12S6, 123
 * roads), against a 100 KB segment cap and a largest whole payload of ~6 KB.
 *
 * WHY AN RCL AND NOT THE RAW LAYER. Two reasons, and the second is the load
 * bearing one:
 *   1. layer is provenance, not a schedule — layer 4 is lab access (labs are
 *      RCL6) and layer 6 is extension corridors (extensions mass from RCL4), so
 *      the numbers do not sort into a build order by themselves.
 *   2. A RAW `layer <= 3` filter IS NOT CONNECTED. The bot slices the road
 *      array in its BFS order precisely because every prefix is then a network
 *      reachable from the sitter (PlanV2 roadsForRcl / auditRoadPrefix), and a
 *      provenance filter punches holes in it: 65 of the 172 rooms end up with
 *      arterial tiles nothing can walk to, because a layer-1 line runs through
 *      tiles a later pass laid — E11S1's eco line to its far source is bridged
 *      at 33,41 and 36,41 by layer-6 corridor tiles. So the bridges are found
 *      here, offline, where there is CPU to do it properly, and demoted into
 *      the arterial set (145 tiles across the fleet); after that all 172 rooms
 *      are connected under the same audit the bot runs.
 *
 * REJECTED — doing the repair in the bot: it is a 0-1 BFS over ~130 tiles that
 * would run on every placement pass (every 15 ticks, every planned room) to
 * recompute a constant of the plan. This side runs once per push.
 * ---------------------------------------------------------------------------
 */
const ARTERIAL_LAYER = 3; // eco kit + tower spurs
const ARTERIAL_RCL = 3; // roads unlock at RCL3 — the earliest they can be built
const REST_RCL = 4; // unchanged from the schedule this replaces

function roadStageFor(plan) {
  const roads = plan.structures.road || [];
  if (!roads.length) return [];
  const layer = (plan.meta && plan.meta.roadLayer) || {};
  const stage = roads.map((r) =>
    (layer[`${r.x},${r.y}`] || 99) <= ARTERIAL_LAYER ? ARTERIAL_RCL : REST_RCL,
  );
  const index = new Map();
  roads.forEach((r, i) => index.set(r.x + r.y * 50, i));
  // containers and the hub structures conduct, exactly as the bot's
  // auditRoadPrefix has it — the generous reading, so we only ever bridge a
  // gap the bot would also call a gap
  const conduct = new Set();
  for (const k of ["storage", "spawn", "container"]) {
    for (const t of plan.structures[k] || []) conduct.add(t.x + t.y * 50);
  }
  const seedTile = (plan.structures.storage || [])[0];
  if (!seedTile) return stage; // no hub to measure from — ship the raw split
  const seed = seedTile.x + seedTile.y * 50;

  // 0-1 BFS from the hub over the road graph: an arterial (or a conductor)
  // costs 0 to enter, any other road tile costs 1. The parent chain of an
  // arterial is therefore the cheapest way to reach it, and every non-arterial
  // on that chain is a bridge the arterial network needs.
  const dist = new Map([[seed, 0]]);
  const parent = new Map();
  const buckets = new Map([[0, [seed]]]);
  let d = 0;
  let maxD = 0;
  while (d <= maxD) {
    const bucket = buckets.get(d) || [];
    while (bucket.length) {
      const cur = bucket.pop();
      if ((dist.get(cur) ?? Infinity) < d) continue;
      const x = cur % 50;
      const y = Math.floor(cur / 50);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx > 49 || ny < 0 || ny > 49) continue;
          const np = nx + ny * 50;
          const i = index.get(np);
          const isRoad = i !== undefined;
          const isConductor = conduct.has(np);
          if (!isRoad && !isConductor) continue;
          const free = isConductor || stage[i] <= ARTERIAL_RCL;
          const nd = d + (free ? 0 : 1);
          if (nd < (dist.get(np) ?? Infinity)) {
            dist.set(np, nd);
            parent.set(np, cur);
            if (!buckets.has(nd)) buckets.set(nd, []);
            buckets.get(nd).push(np);
            if (nd > maxD) maxD = nd;
          }
        }
      }
    }
    d++;
  }

  let bridged = 0;
  for (let i = 0; i < roads.length; i++) {
    if (stage[i] > ARTERIAL_RCL) continue;
    let cur = roads[i].x + roads[i].y * 50;
    while (cur !== undefined && cur !== seed) {
      const j = index.get(cur);
      if (j !== undefined && stage[j] > ARTERIAL_RCL) {
        stage[j] = ARTERIAL_RCL;
        bridged++;
      }
      cur = parent.get(cur);
    }
  }
  // for the log line only — JSON.stringify drops properties hung off an array,
  // so this never reaches the segment
  stage.bridged = bridged;
  return stage;
}

/**
 * The bot's own connectivity audit, run here so a plan that would make it warn
 * never reaches the segment. Returns the number of staged road tiles the hub
 * cannot walk to — 0 in all 172 rooms of the fleet snapshot this was built
 * against, where the unrepaired provenance filter broke 65 of them.
 */
function stagedOrphans(plan, stage, rcl) {
  const roads = plan.structures.road || [];
  const selected = roads.filter((r, i) => stage[i] <= rcl);
  const conduct = new Set(selected.map((t) => t.x + t.y * 50));
  for (const k of ["container", "storage", "spawn"]) {
    for (const t of plan.structures[k] || []) conduct.add(t.x + t.y * 50);
  }
  const seedTile = (plan.structures.storage || [])[0];
  if (!seedTile) return 0;
  const seed = seedTile.x + seedTile.y * 50;
  const seen = new Set([seed]);
  const queue = [seed];
  while (queue.length) {
    const cur = queue.pop();
    const x = cur % 50;
    const y = Math.floor(cur / 50);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx > 49 || ny < 0 || ny > 49) continue;
        const np = nx + ny * 50;
        if (seen.has(np) || !conduct.has(np)) continue;
        seen.add(np);
        queue.push(np);
      }
    }
  }
  return selected.filter((t) => !seen.has(t.x + t.y * 50)).length;
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

  // per-road-tile RCL, parallel to structures.road — see roadStageFor
  const roadStage = roadStageFor(plan);
  const orphans = stagedOrphans(plan, roadStage, ARTERIAL_RCL);
  if (orphans) {
    // The bot logs this same count at RCL3 and then builds the stubs anyway.
    // Better to see it here, once, with the room in front of you.
    console.warn(
      `WARNING ${room}: ${orphans} staged RCL${ARTERIAL_RCL} road tiles are not ` +
        `connected to the hub — the bot's auditRoadPrefix will say so too`,
    );
  }

  const payload = {
    room,
    structures: plan.structures,
    sitter: plan.sitter,
    labInputs: plan.labInputs,
    // the min-cut wall RING only (never the bubbles) — this is the defence
    // perimeter every legacy consumer reads
    shellCut: (plan.meta && plan.meta.shell && plan.meta.shell.cut) || [],
    roadStage,
    planHash: hash.toString(36),
    pushedAt: Date.now(),
  };
  const data = JSON.stringify(payload);
  if (data.length > 100 * 1024) throw new Error(`plan too big for one segment: ${data.length}`);
  await api(cfg, "POST", "/api/user/memory-segment", { segment: SEGMENT, data });
  const back = await api(cfg, "GET", `/api/user/memory-segment?segment=${SEGMENT}`);
  if (!back.data || JSON.parse(back.data).room !== room) throw new Error("segment verify failed");
  const arterials = roadStage.filter((s) => s <= ARTERIAL_RCL).length;
  console.log(
    `plan for ${room} -> segment ${SEGMENT} (${data.length} bytes) hash ${payload.planHash} ` +
      `shellCut ${payload.shellCut.length} labInputs ${(payload.labInputs || []).length} ` +
      `roads ${roadStage.length} (${arterials} arterial at RCL${ARTERIAL_RCL}, ` +
      `${roadStage.bridged || 0} of them bridge tiles) ok`,
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
