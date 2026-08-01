/**
 * Push a v2 plan into memory segment 88 so the bot can adopt it.
 *
 *   node tools/server/push-plan.mjs E11S2 [--dest pserver] [--user <username>] [--adopt]
 *   node tools/server/push-plan.mjs W1N1 --dest vps-ip --live --adopt
 *
 * Reads tools/plan-suite/out-v2/plans-hub.json (run plan.mjs first).
 * With --adopt, also sends `adoptPlan("<room>")` to the user's console.
 * --user resolves/mints a redis API token for that user (plans live in
 * per-user segments, so push as the user whose bot will build).
 *
 * ---------------------------------------------------------------------------
 * --live — PLAN A ROOM ON A SERVER THIS MACHINE CANNOT REACH THE DATABASE OF.
 *
 * plan.mjs gets its terrain and its source/controller/mineral positions out of
 * the LOCAL docker mongo (shared.mjs fetchRoomsFromMongo → `docker exec
 * local-screeps-server-mongo-1 mongosh`). The VPS test server has no such
 * handle from here: it is reachable over the tailnet on HTTP only, the repo is
 * forbidden from SSHing to it (tools/server/README.md), and vanilla 4.3.0
 * serves no /api/game/room-objects. So a room over there could never be
 * planned, and the bot fell back to legacy stamp construction — which is what
 * put two parallel road networks into W1N1 (see rooms.construction.ts).
 *
 * --live closes that with the two channels the server DOES offer:
 *   terrain  GET /api/game/room-terrain?room=<r>&encoded=1 — the same
 *            2,500-char string the mongo `rooms.terrain` doc carries, so it
 *            drops straight into the planner's `d.terrain`.
 *   objects  the websocket `subscribe room:<r>` snapshot. The first frame after
 *            a subscribe is the FULL object set for the room (later frames are
 *            deltas), which is all the planner wants: source, controller and
 *            mineral positions.
 * Those two make the exact `{room, terrain, objects}` shape planRoom() takes,
 * so the plan produced here is the same artifact plan.mjs would have written —
 * same pipeline, same layers, same escalation ladder — for a room whose data
 * arrived over the wire instead of out of a container.
 *
 * The result is written to out-v2/live-<room>.json for the record. It is
 * deliberately NOT merged into plans-hub.json: that file is the local fleet
 * snapshot and plan.mjs rewrites it wholesale.
 * ---------------------------------------------------------------------------
 */
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, "..", "..");
const SEGMENT = 88;
/** how long to wait for the room snapshot frame before giving up */
const WS_TIMEOUT_MS = 25000;

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

/**
 * Terrain for one room, as the planner wants it: the 2,500-char encoded string,
 * index y*50+x, '1' = wall / '2' = swamp. Public endpoint, no auth needed.
 */
async function fetchTerrain(cfg, room) {
  const res = await fetch(`${cfg.base}/api/game/room-terrain?room=${room}&encoded=1`);
  const json = await res.json().catch(() => ({}));
  const entry = json && json.ok === 1 && (json.terrain || [])[0];
  if (!entry || typeof entry.terrain !== "string" || entry.terrain.length !== 2500) {
    throw new Error(`room-terrain ${room}: unusable response ${JSON.stringify(json).slice(0, 200)}`);
  }
  return entry.terrain;
}

/**
 * Source / controller / mineral positions, off the websocket room snapshot.
 *
 * Vanilla 4.3.0 has no REST room-objects endpoint, and the console would mean
 * asking the BOT for the answer — which fails exactly when the bot is broken.
 * The socket is served by the game process itself, so it answers whether or not
 * any code is running.
 */
async function fetchRoomObjects(cfg, room) {
  const { default: WebSocket } = await import("ws");
  const { gunzipSync } = await import("zlib");
  const url = cfg.base.replace(/^http/, "ws") + "/socket/websocket";
  return await new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => {
      try { ws.close(); } catch (e) { /* already gone */ }
      reject(new Error(`no room:${room} frame after ${WS_TIMEOUT_MS}ms — is the tailnet up?`));
    }, WS_TIMEOUT_MS);
    const done = (err, val) => {
      clearTimeout(timer);
      try { ws.close(); } catch (e) { /* already gone */ }
      err ? reject(err) : resolve(val);
    };
    ws.on("error", (e) => done(e));
    ws.on("open", () => ws.send("auth " + cfg.token));
    ws.on("message", (data) => {
      const s = data.toString();
      if (s.startsWith("auth failed")) return done(new Error("websocket auth failed — check the token"));
      if (s.startsWith("auth ok")) return ws.send(`subscribe room:${room}`);
      let msg;
      try {
        msg = JSON.parse(s.startsWith("gz:") ? gunzipSync(Buffer.from(s.slice(3), "base64")).toString() : s);
      } catch (e) {
        return; // time/protocol chatter
      }
      if (!Array.isArray(msg) || msg[0] !== `room:${room}`) return;
      const objects = (msg[1] && msg[1].objects) || {};
      const out = [];
      for (const id of Object.keys(objects)) {
        const o = objects[id];
        if (!o || (o.type !== "source" && o.type !== "controller" && o.type !== "mineral")) continue;
        out.push({ type: o.type, x: o.x, y: o.y, room: room });
      }
      // A subscribe always yields the whole room first. An empty first frame
      // means we are watching a room the server has nothing for — fail loudly
      // rather than hand the planner a room with no sources.
      if (!out.length) return done(new Error(`room:${room} snapshot carried no source/controller/mineral`));
      done(null, out);
    });
  });
}

/** Run the offline v2 pipeline against data pulled off a live server. */
async function planLive(cfg, room) {
  const [terrain, objects] = await Promise.all([fetchTerrain(cfg, room), fetchRoomObjects(cfg, room)]);
  const sources = objects.filter((o) => o.type === "source").length;
  const hasController = objects.some((o) => o.type === "controller");
  console.log(`${room}: terrain ok (2500), ${sources} source(s), controller ${hasController ? "yes" : "NO"}`);
  if (!hasController) throw new Error(`${room} has no controller — nothing to plan`);
  const { planRoom } = await import("../plan-suite/v2/pipeline.mjs");
  const plan = planRoom({ room, terrain, objects });
  if (!plan || plan.error) throw new Error(`planner refused ${room}: ${plan && plan.error}`);
  for (const [tag, e] of [
    ["SHELL", plan.shellError],
    ["TOWER", plan.towerError],
    ["LAB", plan.labError],
    ["MISC", plan.miscError],
    ["EXT", plan.extError],
    ["WALLROAD", plan.wallRoadError],
  ]) {
    if (e) console.log(`${room} ${tag} ERROR ${e}`);
  }
  const outDir = path.join(REPO, "tools", "plan-suite", "out-v2");
  fs.mkdirSync(outDir, { recursive: true });
  const { planMs, ...meta } = plan.meta || {};
  fs.writeFileSync(
    path.join(outDir, `live-${room}.json`),
    JSON.stringify(
      { room: plan.room, hub: plan.hub, sitter: plan.sitter, labInputs: plan.labInputs,
        structures: plan.structures, meta, sources: plan.sources, controller: plan.controller,
        mineral: plan.mineral },
      null, 2,
    ),
  );
  const c = (plan.meta && plan.meta.counts) || {};
  console.log(
    `${room}: planned live — hub ${plan.hub && plan.hub.x},${plan.hub && plan.hub.y} · ` +
      `${c.spawn ?? 0} spawns · ${(plan.structures.extension || []).length} extensions · ` +
      `${c.tower ?? 0} towers · ${(plan.structures.road || []).length} roads · ` +
      `wrote out-v2/live-${room}.json`,
  );
  return plan;
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
/** CONTROLLER_STRUCTURES.extension[3] — the extensions a room owns at RCL3 */
const RCL3_EXTENSIONS = 10;

function roadStageFor(plan) {
  const roads = plan.structures.road || [];
  if (!roads.length) return [];
  const layer = (plan.meta && plan.meta.roadLayer) || {};
  const stage = roads.map((r) =>
    (layer[`${r.x},${r.y}`] || 99) <= ARTERIAL_LAYER ? ARTERIAL_RCL : REST_RCL,
  );
  const index = new Map();
  roads.forEach((r, i) => index.set(r.x + r.y * 50, i));

  // ---------------------------------------------------------------------
  // THE ARTERIAL SET HAS TO COVER THE EXTENSIONS THE ROOM ACTUALLY BUILDS.
  //
  // The provenance split above is about where a road CAME FROM, and extension
  // corridors are layer 6, so they all land at RCL4. That is right for the mass
  // and wrong for the first ten: CONTROLLER_STRUCTURES gives a room ten
  // extensions at RCL3 and the bot builds `plan.t.extension[0..9]`, so those ten
  // are standing for a whole RCL. E15S2 shipped four of its ten (19,25 / 15,24 /
  // 21,24 / 21,25) with no road within D8 until RCL4 — a filler walking swamp
  // and bare ground to the tiles it refills every single cycle, at the level
  // where the room has no storage and no link network to soften it.
  //
  // One D4 face per extension, cheapest index first so the choice is a function
  // of the plan and not of iteration luck. It runs BEFORE the bridge repair
  // below on purpose: a demoted face is an arterial like any other and its own
  // path back to the hub gets bridged with the rest.
  // ---------------------------------------------------------------------
  const exts = (plan.structures.extension || []).slice(0, RCL3_EXTENSIONS);
  let extFaced = 0;
  for (const e of exts) {
    const faces = [];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const i = index.get(e.x + dx + (e.y + dy) * 50);
      if (i !== undefined) faces.push(i);
    }
    if (!faces.length) continue; // no planned road face at all — not ours to fix
    if (faces.some((i) => stage[i] <= ARTERIAL_RCL)) continue;
    faces.sort((p, q) => p - q);
    stage[faces[0]] = ARTERIAL_RCL;
    extFaced++;
  }
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
  stage.extFaced = extFaced;
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
    console.error(
      "usage: node tools/server/push-plan.mjs <room> [--dest pserver] [--user <name>] " +
        "[--token <tok>] [--live | --plan-file <json>] [--dry-run] [--adopt]",
    );
    process.exit(1);
  }
  const dest = args.includes("--dest") ? args[args.indexOf("--dest") + 1] : "pserver";
  const cfg = loadConfig(dest);
  // --user mints/looks up a token in the LOCAL redis; --token is the remote
  // equivalent for a server this machine only has HTTP to (the VPS).
  if (args.includes("--user")) {
    cfg.token = tokenForUser(args[args.indexOf("--user") + 1]).token;
  }
  if (args.includes("--token")) {
    cfg.token = args[args.indexOf("--token") + 1];
  }

  let plan;
  if (args.includes("--plan-file")) {
    // A single-room plan JSON — the shape --live writes to out-v2/live-<room>.json.
    // Re-pushing a plan must not require re-planning the room.
    plan = JSON.parse(fs.readFileSync(args[args.indexOf("--plan-file") + 1], "utf8"));
    if (plan.room !== room) throw new Error(`--plan-file is for ${plan.room}, not ${room}`);
  } else if (args.includes("--live")) {
    plan = await planLive(cfg, room);
  } else {
    const plansPath = path.join(REPO, "tools", "plan-suite", "out-v2", "plans-hub.json");
    const plans = JSON.parse(fs.readFileSync(plansPath, "utf8"));
    plan = plans.find((p) => p.room === room);
  }
  if (!plan || !plan.structures) {
    console.error(
      `${room} not in plans-hub.json — run: node tools/plan-suite/v2/plan.mjs --all-claimable ` +
        `(or pass --live to plan it straight off the target server)`,
    );
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
  // --dry-run: everything except the write. The point of it is --live against a
  // server that is already running a bot — you want to see the plan a fresh
  // pipeline produces before it lands in the segment that bot adopts from.
  if (args.includes("--dry-run")) {
    const dryArterials = roadStage.filter((s) => s <= ARTERIAL_RCL).length;
    console.log(
      `DRY RUN — not written. ${room} payload ${data.length} bytes hash ${payload.planHash} ` +
        `shellCut ${payload.shellCut.length} roads ${roadStage.length} (${dryArterials} arterial)`,
    );
    return;
  }
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
