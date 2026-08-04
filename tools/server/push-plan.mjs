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
 * handle from here: it is reachable over the tailnet on HTTP only and the repo
 * is forbidden from SSHing to it (tools/server/README.md). So a room over there
 * could never be planned, and the bot fell back to legacy stamp construction —
 * which is what put two parallel road networks into W1N1 (see
 * rooms.construction.ts).
 *
 * --live closes that with two plain HTTP GETs:
 *   terrain  GET /api/game/room-terrain?room=<r>&encoded=1 — the same
 *            2,500-char string the mongo `rooms.terrain` doc carries, so it
 *            drops straight into the planner's `d.terrain`.
 *   objects  GET /api/game/room-objects?room=<r> with X-Token auth. The VPS
 *            serves this now (it did not when --live was written), so one
 *            request replaces the old 25 s websocket subscribe. The planner
 *            only wants source / controller / mineral positions out of it.
 *            Servers without the endpoint fall back to the websocket
 *            `subscribe room:<r>` snapshot, whose first frame is the full
 *            object set for the room.
 * Both channels are answered by the game process rather than by the bot, so
 * they keep working when the uploaded code is broken.
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
import { fileURLToPath, pathToFileURL } from "url";

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

const PLAN_TYPES = new Set(["source", "controller", "mineral"]);

/**
 * Source / controller / mineral positions.
 *
 * Preferred path is the REST endpoint `GET /api/game/room-objects?room=X`
 * (X-Token auth) — one request, no ws dependency, no 25 s subscribe wait. Both
 * the local server and the VPS (4.3.0 + mods) serve it now. Like the socket it
 * is answered by the game process, not by the bot, so it still works when the
 * uploaded code is broken.
 *
 * Servers that don't expose it fall through to the websocket snapshot below.
 */
async function fetchRoomObjectsRest(cfg, room) {
  const res = await fetch(`${cfg.base}/api/game/room-objects?room=${room}`, {
    headers: { "X-Token": cfg.token, "X-Username": cfg.token },
  });
  if (!res.ok) throw new Error(`room-objects ${room}: HTTP ${res.status}`);
  const json = await res.json().catch(() => ({}));
  // the VPS answers {ok:1, objects:[...]}; the local server's mod answers
  // {objects:[...], users:{...}} with no `ok` at all — both are fine
  if (!json || json.ok === 0 || !Array.isArray(json.objects)) {
    throw new Error(`room-objects ${room}: unusable response ${JSON.stringify(json).slice(0, 200)}`);
  }
  const out = json.objects
    .filter((o) => o && PLAN_TYPES.has(o.type))
    .map((o) => ({ type: o.type, x: o.x, y: o.y, room }));
  if (!out.length) throw new Error(`room-objects ${room} carried no source/controller/mineral`);
  return out;
}

async function fetchRoomObjects(cfg, room) {
  try {
    return await fetchRoomObjectsRest(cfg, room);
  } catch (e) {
    console.log(`${room}: REST room-objects unavailable (${e.message}) — falling back to websocket`);
    return await fetchRoomObjectsWs(cfg, room);
  }
}

/** Legacy path: subscribe to `room:X` on the game websocket and take frame 1. */
async function fetchRoomObjectsWs(cfg, room) {
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
 *
 * ---------------------------------------------------------------------------
 * WHAT THE ARTERIAL SET ACTUALLY GUARANTEES. Four things, in the order the
 * passes below run, because "roads a hauler actually walks" was for a while a
 * description of the INTENT rather than of the output and two of the four had
 * to be added after the fact:
 *
 *   1. every road tile whose provenance layer is <= 3 (eco kit + tower spurs);
 *   2. one D4 face road for each of `extension[0..9]`, the ten extensions a
 *      room owns at RCL3;
 *   3. one D4 face road for each container the room builds at RCL2 — the two
 *      source containers and the controller container (29 tiles, 27 rooms);
 *   4. a connected chain from the hub to every one of those same containers,
 *      because a face road is not the same as a route to it (9 tiles, 5 rooms);
 *
 * and then, over all of the above, the bridge repair that makes the result a
 * network the hub can walk rather than a set of disconnected intentions.
 *
 * (3) and (4) are the same three tiles per room approached from two directions,
 * and both were missing: the set covered `extension[0..9]` and stopped, so the
 * containers — built at RCL2, a whole level EARLIER than those extensions —
 * had no guarantee at all. Fleet-wide the two add 49 road tiles to RCL3 across
 * 32 of the 172 rooms, max 4 in one room (E17S5), against an arterial set of
 * 7,870 of 14,053 tiles. See the pass comments for the rooms and the numbers.
 * ---------------------------------------------------------------------------
 */
const ARTERIAL_LAYER = 3; // eco kit + tower spurs
/**
 * RCL3 is where a road can FIRST be built in this bot. Not a game rule —
 * vanilla CONTROLLER_STRUCTURES.road is 2500 from RCL0 — but a bot policy:
 * PlanV2.typeAllowedAtRcl("road") is `lvl >= 3` and roadsForRcl returns []
 * below 3. So "staged with the thing it serves" can never mean RCL2 for a
 * road, no matter what the thing it serves is built at; the earliest legal
 * road stage is 3, and that is what every guarantee in this function promises.
 */
const ARTERIAL_RCL = 3;
const REST_RCL = 4; // unchanged from the schedule this replaces
/** CONTROLLER_STRUCTURES.extension[3] — the extensions a room owns at RCL3 */
const RCL3_EXTENSIONS = 10;
/** the four orthogonal neighbours — a "face", the same reading the extension
 *  and container guarantees below both use */
const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * ---------------------------------------------------------------------------
 * THE CONTAINERS THE ROOM BUILDS AT RCL2 — which are also, exactly, its eco
 * terminals. One set, two names, and it is worth spelling out why they
 * coincide, because the two findings this function answers came in as separate
 * complaints and turned out to be about the same three tiles per room.
 *
 * The planner emits containers as [source, source, controller, mineral].
 * CONTROLLER_STRUCTURES.container is 5 from RCL2, so the RCL cap never binds —
 * what actually decides the RCL2 build set is PlanV2.plannedTilesFor, which
 * DROPS the mineral container below RCL6 (the extractor that gives it a purpose
 * is RCL6; median chebyshev 17 from the hub, max 38). Everything it leaves is
 * built at RCL2 and everything it leaves is an eco terminal: a hauler withdraws
 * from it every cycle from the tick the room hits RCL2.
 *
 * So this mirrors plannedTilesFor's structural test verbatim rather than
 * assuming the [src, src, ctrl, mineral] order — including its tie rule (take
 * the LAST extractor-adjacent container, because E8S3's controller at 21,29
 * sits 3 tiles from its mineral at 23,26 and its genuine CONTROLLER container
 * at 24,26 is therefore also mineral-adjacent; "drop all candidates" would take
 * E8S3's controller container out of the set it most needs to be in). If the
 * two ever disagree, the bot builds a container this side never promised a road
 * to, which is precisely the bug below.
 *
 * Measured on the 172-room snapshot: every room plans exactly 4 containers and
 * exactly 1 extractor, so this returns 3 tiles in 172/172 rooms — 2 source
 * containers and 1 controller container.
 * ---------------------------------------------------------------------------
 */
function rcl2Containers(plan) {
  const planned = plan.structures.container || [];
  const extractors = plan.structures.extractor || [];
  // no extractor planned — plannedTilesFor defers nothing, so the room really
  // does build all four at RCL2 and all four want the guarantee
  if (!planned.length || !extractors.length) return planned.slice();
  let drop = -1;
  for (let i = 0; i < planned.length; i++) {
    for (const e of extractors) {
      if (Math.abs(planned[i].x - e.x) <= 1 && Math.abs(planned[i].y - e.y) <= 1) {
        drop = i; // keep scanning: the LAST match is the mineral one
        break;
      }
    }
  }
  if (drop < 0) return planned.slice();
  return planned.slice(0, drop).concat(planned.slice(drop + 1));
}

function roadStageFor(plan) {
  const roads = plan.structures.road || [];
  if (!roads.length) return [];
  const layer = (plan.meta && plan.meta.roadLayer) || {};
  const stage = roads.map((r) =>
    (layer[`${r.x},${r.y}`] || 99) <= ARTERIAL_LAYER ? ARTERIAL_RCL : REST_RCL,
  );
  const index = new Map();
  roads.forEach((r, i) => index.set(r.x + r.y * 50, i));

  /**
   * Promote ONE D4 face road of `t` into the arterial set, unless a D4 face is
   * already arterial. Returns 1 if it promoted a tile, 0 if the tile was
   * already served or the planner never laid a face road next to it.
   *
   * Cheapest ROAD-ARRAY INDEX wins, and index is the tie-break for a reason
   * beyond determinism: `structures.road` is BFS-ordered outward from the
   * sitter, so the lowest index among a tile's faces is the one nearest the hub
   * in the road graph — i.e. the face whose own chain back to the arterial
   * network is likely the shortest, which is what the bridge repair below then
   * has to pay for.
   *
   * Both callers run BEFORE that bridge repair on purpose: a promoted face is
   * an arterial like any other and its own path back to the hub gets bridged
   * with the rest, so neither pass can leave a road tile nothing can walk to.
   */
  const faceGuarantee = (t) => {
    const faces = [];
    for (const [dx, dy] of D4) {
      const i = index.get(t.x + dx + (t.y + dy) * 50);
      if (i !== undefined) faces.push(i);
    }
    if (!faces.length) return 0; // no planned road face at all — not ours to fix
    if (faces.some((i) => stage[i] <= ARTERIAL_RCL)) return 0;
    faces.sort((p, q) => p - q);
    stage[faces[0]] = ARTERIAL_RCL;
    return 1;
  };

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
  // ---------------------------------------------------------------------
  const exts = (plan.structures.extension || []).slice(0, RCL3_EXTENSIONS);
  let extFaced = 0;
  for (const e of exts) extFaced += faceGuarantee(e);

  // ---------------------------------------------------------------------
  // AND THE CONTAINERS THE ROOM BUILDS AT RCL2 — THE SAME GUARANTEE, ONE RCL
  // EARLIER IN THE THING BEING SERVED.
  //
  // The pass above covered `extension[0..9]` and stopped there, which was an
  // arbitrary place to stop: containers are built at RCL2, a whole level BEFORE
  // those extensions exist, and they got no face guarantee at all. 29 of the
  // fleet's 516 RCL2 containers, across 27 of the 172 rooms, had a planned road
  // on a D4 face and that road staged RCL4 — so the container stood finished at
  // RCL2 with its serving tile two whole RCLs away. E16S6 is the clean example:
  // its controller container 16,19 is built at RCL2, its face road 16,20 was
  // RCL4, and the diagonal 17,20 that also serves it was RCL4 too, so the
  // upgrader haul ran over bare ground from RCL2 to RCL4. The rest, all
  // source-side unless marked: E12S1 28,11 + 36,24 · E12S2 22,26 (ctrl) ·
  // E12S5 15,11 (ctrl) · E12S6 35,14 · E13S5 24,17 · E13S6 10,29 · E15S3 8,6 ·
  // E15S8 19,32 · E15S9 40,27 · E16S2 4,22 · E17S1 20,27 · E17S5 44,35 +
  // 26,32 (ctrl) · E18S6 27,8 · E19S7 42,41 · E1S5 33,22 · E21S3 37,20 ·
  // E21S6 31,26 (ctrl) · E21S9 5,32 · E2S3 40,36 · E2S5 21,41 · E3S7 37,23 ·
  // E4S6 18,31 · E5S4 32,17 · E6S8 41,15 · E7S2 27,39 · E9S2 35,5.
  //
  // "STAGED WITH IT" MEANS RCL3, NOT RCL2. The container is RCL2 and the road
  // cannot be: PlanV2.typeAllowedAtRcl hard-gates road at lvl >= 3 (see
  // ARTERIAL_RCL). So the promise this makes is the honest one — the face road
  // lands at the FIRST RCL a road is allowed to exist, one level after the
  // container rather than two or three. RCL2 still walks that container on bare
  // ground; nothing here can change that without changing the bot's road gate.
  //
  // WHY D4 AND NOT D8, given the game lets a hauler withdraw from any of the 8
  // neighbours and walk diagonally between them. Two reasons. (1) Consistency:
  // this is the extension guarantee's own convention and the two now share a
  // function, so there is one rule in this file instead of two. (2) Under a D8
  // reading only 8 containers look stranded — and they are EXACTLY the 8 that
  // the reachability guarantee below already fixes (E14S5 42,39, E15S4 13,14,
  // E16S6 16,19, E17S5 44,35, E18S4 27,20, E21S9 5,32, E3S5 16,15, E8S6 15,25),
  // so a D8 rule here would be dead code. D4 is the reading that actually buys
  // something: a road square-on to the container, which is where a hauler
  // arriving along an orthogonal line stops.
  //
  // Cost is bounded and small — at most one tile per container, and because the
  // container itself CONDUCTS in the bridge BFS below, a promoted face that
  // hangs off an already-reachable container costs exactly that one tile.
  // ---------------------------------------------------------------------
  const ecoTerminals = rcl2Containers(plan);
  let c2Faced = 0;
  for (const c of ecoTerminals) c2Faced += faceGuarantee(c);

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

  /**
   * 0-1 BFS from the hub over the road graph: an arterial (or a conductor)
   * costs 0 to enter, any other road tile costs 1. The parent chain of a tile
   * is therefore the cheapest way to reach it, and every non-arterial on that
   * chain is a bridge the arterial network needs.
   *
   * Reads `stage` live, so it must be RE-RUN after anything promotes tiles —
   * a chain answered off a stale snapshot is still correct (it is a superset of
   * what is needed) but no longer minimal, and the RCL3 road budget is real.
   */
  const zeroOneBfs = () => {
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
    return parent;
  };

  /**
   * Walk the cheapest-parent chain from `from` back to the hub and promote
   * every non-arterial road on it. Returns how many tiles it promoted.
   *
   * This only ever re-stages tiles the planner ALREADY put in
   * `structures.road` — `index.get` is the sole way a tile gets touched, and a
   * chain step that lands on terrain, on a conductor, or on nothing at all is
   * skipped. This pass must never invent a road the planner did not place: the
   * bot builds `structures.road` and reads `roadStage` as a parallel array, so
   * a phantom tile here has nowhere to land.
   */
  const promoteChain = (parent, from) => {
    let promoted = 0;
    let cur = from;
    while (cur !== undefined && cur !== seed) {
      const j = index.get(cur);
      if (j !== undefined && stage[j] > ARTERIAL_RCL) {
        stage[j] = ARTERIAL_RCL;
        promoted++;
      }
      cur = parent.get(cur);
    }
    return promoted;
  };

  let bridged = 0;
  const bridgeParent = zeroOneBfs();
  for (let i = 0; i < roads.length; i++) {
    if (stage[i] > ARTERIAL_RCL) continue;
    bridged += promoteChain(bridgeParent, roads[i].x + roads[i].y * 50);
  }

  // ---------------------------------------------------------------------
  // THE ARTERIAL SET MUST REACH EVERY ECO TERMINAL, NOT JUST EVERY ARTERIAL.
  //
  // The bridge loop above starts from tiles that are ALREADY arterial and joins
  // them up. That makes the arterial set connected — which is the invariant the
  // bot's auditRoadPrefix checks — but connected is not the same as USEFUL, and
  // the claim this staging is sold on (PlanV2 PLACE_ORDER: "RCL3 builds the
  // roads a hauler actually walks") is a claim about the terminals, not about
  // the network's internal consistency. A container is not a road, so it is
  // never a seed of that loop, and in 8 of the 172 rooms the layer-1 eco line
  // stopped a handful of tiles short of the terminal it was laid for and
  // nothing noticed:
  //
  //   source containers      E14S5 42,39 (3 unpaved tiles short) ·
  //                          E18S4 27,20 (2) · E3S5 16,15 (2) ·
  //                          E17S5 44,35 (2) · E21S9 5,32 (1)
  //   controller containers  E15S4 13,14 (1) · E16S6 16,19 (1) · E8S6 15,25 (1)
  //
  // Small gaps, and that is the point: 1 to 3 tiles, at the end of a 30-tile
  // arterial the room paid for in full, on the exact tile a hauler stands on
  // every single cycle from RCL2. E14S5's far miner walked the last 3 tiles of
  // its haul over bare ground until RCL4 while the other 40 tiles of that same
  // line were roaded at RCL3.
  //
  // The fix is the same machinery, one more set of seeds: run the 0-1 BFS's
  // parent chain from each eco terminal too. Because the BFS charges 1 per
  // not-yet-arterial road tile and 0 for arterials and conductors, the chain it
  // returns is a CHEAPEST one — the fewest new RCL3 tiles that join this
  // terminal to what the room is already building. Not a blanket promotion:
  // 9 tiles over the whole fleet. 164 of the 172 rooms already reach all three
  // terminals and pay nothing, and of the 8 that do not, three (E16S6 16,19,
  // E17S5 44,35, E21S9 5,32) are already paid for by the container-face pass
  // above and its bridging — they are exactly the rooms that showed up in BOTH
  // findings. So this pass fires in 5 rooms: E14S5 (3 tiles), E18S4 (2),
  // E3S5 (2), E15S4 (1), E8S6 (1).
  //
  // THE BFS IS RE-RUN RATHER THAN REUSED, and honestly it buys nothing on this
  // snapshot — swapping `zeroOneBfs()` for `bridgeParent` here gives a
  // byte-identical result in all 172 rooms. It is kept because the cheap thing
  // is the wrong-by-default thing: the bridge loop has just promoted tiles, so
  // a pre-bridge parent chain can route a terminal down a corridor that is now
  // more expensive than the one the room is already building, and buy tiles it
  // did not need. That never happens here, but "never happens on the 172 rooms
  // I looked at" is not a property of the algorithm, and the cost of insuring
  // against it is one 0-1 BFS over ~130 tiles in a script that already parses
  // an 8 MB JSON once per push.
  //
  // TWO APPROXIMATIONS THAT REMAIN, BOTH DELIBERATE:
  //  1. The terminals share one (post-bridge) snapshot, so terminal 2's chain
  //     does not get to reuse tiles terminal 1 just promoted. Doing that
  //     properly is a Steiner tree; the chains overlap heavily in practice
  //     because they share the hub end, and at 9 tiles fleet-wide there is
  //     nothing left to win.
  //  2. Ties in the BFS fall out of its fixed neighbour scan (dx then dy,
  //     -1..1) and its LIFO buckets, not out of a global reading-order sort of
  //     equal-cost paths. That is deterministic — the same plan in gives the
  //     same stage array out, verified byte-for-byte over all 172 rooms — but
  //     it is "deterministic", not "provably the lexicographically first
  //     shortest chain". Nothing downstream depends on which equal chain wins.
  //
  // START AT THE TERMINAL'S PARENT, NOT AT THE TERMINAL. Road and container are
  // both non-obstacle in Screeps, so they legally share a tile and the planner
  // sometimes uses that: E3S9 has a layer-7 (rampart spur) road planned UNDER
  // all three of its eco containers — 32,16, 31,26 and 45,8 — and E14S1 one
  // under 23,17. Seeding the walk on the container tile made `index.get` find
  // those roads and promote them, 24 tiles across 20 rooms whose terminals were
  // never stranded in the first place. A creep stands on a container whether or
  // not there is a road under it; what this guarantee is about is the tiles it
  // walks to GET there. The road under the terminal stays at RCL4 with the rest
  // of its layer.
  // ---------------------------------------------------------------------
  let ecoGuarded = 0;
  const ecoParent = zeroOneBfs();
  for (const c of ecoTerminals) ecoGuarded += promoteChain(ecoParent, ecoParent.get(c.x + c.y * 50));

  // for the log line only — JSON.stringify drops properties hung off an array,
  // so this never reaches the segment
  stage.bridged = bridged;
  stage.extFaced = extFaced;
  stage.c2Faced = c2Faced;
  stage.ecoGuarded = ecoGuarded;
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
      `roads ${roadStage.length} (${arterials} arterial at RCL${ARTERIAL_RCL}: ` +
      `${roadStage.bridged || 0} bridge, ${roadStage.extFaced || 0} extension faces, ` +
      `${roadStage.c2Faced || 0} RCL2-container faces, ` +
      `${roadStage.ecoGuarded || 0} eco-terminal reach) ok`,
  );

  if (args.includes("--adopt")) {
    await api(cfg, "POST", "/api/user/console", { expression: `adoptPlan("${room}")` });
    console.log(`sent: adoptPlan("${room}")`);
  } else {
    console.log(`in the game console run: adoptPlan("${room}")`);
  }
}

// Only run the push when this file IS the entry point. The staging functions
// above are the thing an offline check wants to exercise, and a check that
// re-implements them proves nothing about what actually ships — the RCL3
// arterial findings (E14S5, E16S6 et al, below) were all found by re-deriving
// a COPY of roadStageFor, which is exactly how a copy drifts from the original.
// Importing this module now gets you the real functions and no side effects.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}

export { roadStageFor, stagedOrphans, ARTERIAL_RCL, ARTERIAL_LAYER, REST_RCL, RCL3_EXTENSIONS };
