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
 * and hub->controller lines unpaved. The arterial set this function produces is
 * printed, per-room quantiles and all, by `--census` — see the ARTERIAL SIZE
 * line there.
 *
 * IT USED TO BE FOUR HAND-TRANSCRIBED PER-ROOM NUMBERS ("35 tiles in E16S1, 53
 * in E12S9, 45 in E9S2 — median 39, max 85"), sitting eight lines above a
 * sentence claiming EVERY NUMBER IN THIS HEADER IS PRINTED BY `--census`. All
 * five were stale — the true readings were 39/54/47, median 44, max 87 — and
 * the census did not print any of them, so the claim was false about exactly the
 * numbers that were wrong. A figure quoted in a comment is a figure that rots;
 * the fix is not to re-transcribe it, it is to make something print it, which
 * is what the census line now does.
 *
 * WHAT IS SHIPPED: `roadStage`, a parallel int array in the same order and of
 * the same length as `structures.road`, holding the RCL each tile is wanted at.
 * Not a `{"x,y": layer}` object — the consumer stores this in
 * room.memory.planV2, which is JSON-parsed and re-serialised EVERY TICK, so the
 * unpacked form (`"12,34":6,` — 10 bytes) would cost five times as much as
 * `3,` for the same schedule, forever. The cost is 2N+12 bytes on a room of N
 * roads against a 100 KB segment cap and a largest whole payload of ~6 KB, and
 * the median and largest rooms it lands on are printed by `--census` on the
 * "roadStage payload" line rather than transcribed here.
 * [r22-waived: the sentence below QUOTES the rotted figure — "(E12S6, 123
 * roads)" — as the finding's own evidence; correcting it would delete the
 * finding.] (Half of that sentence
 * was updated when the fleet moved and half was not — "+260 on the largest" fits
 * 124 roads and the same clause named 123 (E12S6, 123 roads) — which is
 * precisely the failure this header's own rule exists to prevent. Mm5, round 22.)
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
 *      the arterial set — `--census` prints how many, on the "bridge repair"
 *      line, and the number this sentence used to state (145) had drifted to a
 *      third of the truth. Same rule as everywhere else in this header now: if
 *      it is a number, something prints it. After the repair all 172 rooms are
 *      connected under the same audit the bot runs.
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
 *      source containers and the controller container (30 tiles, 28 rooms);
 *   4. a connected chain from the hub to every one of those same containers,
 *      because a face road is not the same as a route to it (7 tiles, 4 rooms);
 *
 * and then, over all of the above, the bridge repair that makes the result a
 * network the hub can walk rather than a set of disconnected intentions.
 *
 * (3) and (4) are the same three tiles per room approached from two directions,
 * and both were missing: the set covered `extension[0..9]` and stopped, so the
 * containers — built at RCL2, a whole level EARLIER than those extensions —
 * had no guarantee at all. Fleet-wide the two add 37 road tiles to RCL3 across
 * 32 of the 172 rooms, max 3 in one room (E14S5), against an arterial set of
 * 7,926 of 14,100 tiles.
 *
 * EVERY NUMBER IN THIS HEADER IS PRINTED BY `--census`, and that is the only
 * reason it is allowed to be here. The previous set was hand-transcribed from an
 * off-line re-derivation of a fleet that has been re-planned since, and two of
 * them were wrong by one ("12 RCL2-built containers across 10 rooms" reached the
 * goal document off a comment that itself said 29/27; the arterial split read
 * 7,870 of 14,053 against a measured 7,871 of 14,055). Re-run --census after any
 * change to this file or to the planner and paste what it says.
 *
 * ROUND 21 IS THE WORKED EXAMPLE OF WHY THAT LAST SENTENCE SAYS "OR TO THE
 * PLANNER". Round 20 re-ran the census, wrote the result into the goal document
 * and did not carry it here, so four of these numerals were one out. They were
 * carried in this round — and then the round's own planner change (the
 * sealed-floor recovery in E11S7 takes a different seat under the declared-key
 * ruling, two roads fewer) moved three of them straight back and the arterial
 * split to 7,926 of 14,100. Every numeral above is the current --census output
 * of the shipped artifact; none of them is a constant, and a re-plan is a reason
 * to re-run it.
 *
 * ROUND 22 IS THE SECOND WORKED EXAMPLE, and it is why the rule now has a GATE
 * behind it rather than a paragraph. Layer 7b's along-the-wall swap became the
 * delta predicate its own published sentence states, five rooms moved a road
 * one tile, and two of these numerals moved with them (the container chain 6/3
 * -> 7/4, the two passes together 36/31 -> 37/32) — a change nobody would have
 * thought to re-run the census for. `tools/plan-suite/v2/numeral-audit.mjs`
 * re-derives the fleet numerals in this repository's prose against the shipped
 * artifact and exits 1 on rot; `plan.mjs --all-claimable` runs it as its last
 * step. This header's own rule finally has something enforcing it.
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
  return containersForRcl(plan, CONTAINER_RCL);
}

/**
 * ---------------------------------------------------------------------------
 * THE CONTAINERS THAT ACTUALLY EXIST AT `lvl`. The general form of the function
 * above, and the ONLY thing anything on this side may use to build a conductor
 * set.
 *
 * It used to be that `rcl2Containers` was the RCL-aware reading and every OTHER
 * consumer — the bridge BFS's `conduct` set, `stagedOrphans`, the census's
 * reachability check, and the bot's own auditRoadPrefix — reached straight into
 * the raw `plan.structures.container` array. That is four places asserting that
 * a room at RCL3 can walk over four containers when PlanV2.plannedTilesFor only
 * lets it build three.
 *
 * WHY THAT IS WORSE THAN A NORMAL OFF-BY-ONE: THE AUDIT SHARED THE GRAPH WITH
 * THE THING IT AUDITS, SO IT REPORTED ZERO BY CONSTRUCTION. `stagedOrphans` and
 * the census both answered "is this staged road reachable / is this eco terminal
 * reachable" on the same too-generous graph the promotion pass had just used to
 * decide it did not need to promote anything. Two functions agreeing with each
 * other is not evidence; it is the same mistake counted twice. This is the exact
 * failure mode as the spawn/storage conductor bug of round 10, one round later
 * and one tile over — which is the argument for a single shared helper rather
 * than a second correct copy.
 *
 * What it costs on the shipped fleet: E5S1 plans containers at 7,9 / 30,13 /
 * 28,33 / 29,30 with its mineral+extractor at 30,31, so 29,30 is the mineral
 * container and is not built until RCL6. At RCL3-5 the eco terminal at 28,33 is
 * only reachable by standing on 29,30, and the staged roads at 28,31 / 28,32 /
 * 29,34 hang off nothing. Every one of those was invisible while the checker
 * stood on a container the room had not built.
 *
 * Three rules apply, in this order, and they are PlanV2's rules — mirrored here
 * rather than imported because PlanV2 is TypeScript and this is a plain node
 * script, which means the two CAN drift and this comment is the only thing
 * stopping it:
 *   · typeAllowedAtRcl("container") is `lvl >= 2` — nothing at all at RCL0/1;
 *   · plannedTilesFor defers the extractor-adjacent (mineral) container below
 *     RCL6, taking the LAST candidate on a tie (see the E8S3 note above);
 *   · CONTROLLER_STRUCTURES.container caps the count.
 *
 * CONTAINER IS THE ONLY CONDUCTOR THERE IS, and that is a deliberate reading of
 * the engine, not an oversight: everything else in a plan is either a road (in
 * `stage`, filtered separately and already RCL-aware) or in
 * OBSTACLE_OBJECT_TYPES. Rampart and extractor are technically walkable and are
 * still NOT in the set — adding a conductor can only ever make this audit
 * quieter, and a quieter audit is precisely what we have just spent two rounds
 * digging back out.
 * ---------------------------------------------------------------------------
 */
/** PlanV2.typeAllowedAtRcl("container") */
const CONTAINER_RCL = 2;
/** PlanV2.EXTRACTOR_RCL — the RCL that gives the mineral container a purpose */
const EXTRACTOR_RCL = 6;
/** CONTROLLER_STRUCTURES.container. It is 5 from RCL1 and every room in the
 *  snapshot plans exactly 4, so this has never bound — applied anyway so that a
 *  planner which one day emits a fifth container cannot make this side claim a
 *  conductor the bot is not allowed to build. */
const CONTAINER_CAP = 5;

/**
 * ---------------------------------------------------------------------------
 * THE STAGING ORDER — ONE FIXED ORDER, AND EVERY RCL TAKES A PREFIX OF IT.
 *
 * WHY THE SHAPE OF THIS FUNCTION MATTERS MORE THAN ITS OUTPUT. A build schedule
 * has one invariant that is not negotiable: MONOTONICITY. A structure that the
 * room builds at RCL n must still be in the set at RCL n+1, because there is no
 * such thing as un-building — the bot would either leave it standing (and the
 * schedule is a lie) or demolish something it just paid for.
 *
 * The previous form computed each level independently: drop the deferred seat
 * below RCL6, then `.slice(0, CAP)`. That is monotone ON THIS FLEET and only by
 * arithmetic accident — every room plans exactly 4 containers against a cap of
 * 5, so the cap never binds and the two branches differ by exactly the deferred
 * tile. Give it SIX planned containers with the mineral seat at index 3 and it
 * breaks: RCL5 drops index 3 and slices 5 off the remaining five, so the room
 * builds {0,1,2,4,5}; RCL6 defers nothing and slices the first five, {0,1,2,3,4}
 * — container 5 was built at RCL5 and is gone at RCL6. The invariant held
 * because of a count in the artifact, not because of anything in the code, and
 * a count in the artifact is exactly the kind of thing a planner change moves.
 *
 * So the schedule is made monotone STRUCTURALLY instead. Each container is
 * placed exactly once in a single fixed order — everything that exists from
 * CONTAINER_RCL first, in plan order, and the extractor-deferred mineral seat
 * LAST — and every level then takes a PREFIX of that one order whose length is
 * non-decreasing in the level. Nested prefixes cannot un-build: that is the
 * whole proof, and it does not depend on how many containers a plan carries.
 *
 * The tie rule is unchanged and still deliberate: the LAST extractor-adjacent
 * container is the mineral one, because E8S3's controller at 21,29 sits 3 tiles
 * from its mineral at 23,26 and its genuine CONTROLLER container at 24,26 is
 * therefore also mineral-adjacent. Taking the last match keeps that room's
 * controller container in the early set where it belongs.
 *
 * BYTE-IDENTICAL ON THE CURRENT ARTIFACT, and deliberately so: with 4 planned
 * containers and 1 deferred, the prefix is the 3 early ones below RCL6 and all
 * 4 from RCL6, which is what the old branches returned. The return is filtered
 * out of `planned` rather than assembled out of `order`, so the ORDER of the
 * result is plan order at every level too — verified tile-for-tile over all 172
 * rooms × RCL 1-8.
 * ---------------------------------------------------------------------------
 */
function containerStageOrder(plan) {
  const planned = (plan.structures && plan.structures.container) || [];
  const extractors = (plan.structures && plan.structures.extractor) || [];
  let deferred = -1;
  for (let i = 0; i < planned.length; i++) {
    for (const e of extractors) {
      if (Math.abs(planned[i].x - e.x) <= 1 && Math.abs(planned[i].y - e.y) <= 1) {
        deferred = i; // keep scanning: the LAST match is the mineral one
        break;
      }
    }
  }
  const order = [];
  for (let i = 0; i < planned.length; i++) if (i !== deferred) order.push(i);
  if (deferred >= 0) order.push(deferred);
  // how many of that order exist BEFORE the extractor does — i.e. the prefix
  // length RCL2..RCL5 takes. From EXTRACTOR_RCL the prefix is the whole order.
  return { planned, order, early: deferred >= 0 ? order.length - 1 : order.length };
}

/** rooms already warned about an over-cap container list — this function is
 *  called ~12 times per room per run and the finding is one per room */
const capWarned = new Set();

function containersForRcl(plan, lvl) {
  if (lvl < CONTAINER_RCL) return [];
  const { planned, order, early } = containerStageOrder(plan);
  // ASSERT-AND-CLAMP, OUT LOUD. The cap is a game rule
  // (CONTROLLER_STRUCTURES.container) and clamping to it is right; doing so
  // SILENTLY is not, because the tiles that fall off the end are containers the
  // planner emitted and the bot will never build, and every consumer on this
  // side would then quietly stop promising them a road.
  if (order.length > CONTAINER_CAP && !capWarned.has(plan.room)) {
    capWarned.add(plan.room);
    console.warn(
      `WARNING ${plan.room}: plan carries ${order.length} containers but ` +
        `CONTROLLER_STRUCTURES.container caps a room at ${CONTAINER_CAP} — the last ` +
        `${order.length - CONTAINER_CAP} (staging order, mineral seat last) are dropped from every ` +
        `conductor and eco-terminal set on this side. This is a PLANNER finding: the bot cannot build ` +
        `them either.`,
    );
  }
  const take = Math.min(CONTAINER_CAP, lvl >= EXTRACTOR_RCL ? order.length : early);
  const keep = new Set(order.slice(0, take));
  // returned in PLAN order, not staging order — the prefix decides WHICH tiles
  // are in the set (that is where monotonicity lives); nothing downstream wants
  // them re-ordered, and keeping plan order is what makes this change a no-op
  // on the shipped artifact.
  return planned.filter((_, i) => keep.has(i));
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
  // those extensions exist, and they got no face guarantee at all. On the fleet
  // this pass currently ships against, 30 RCL2 containers across 28 of the 172
  // rooms have a planned road on a D4 face and that road staged RCL4 — so the
  // container would stand finished at RCL2 with its serving tile two whole RCLs
  // away. E16S6 is the shape: its controller container is built at RCL2, its
  // face road was RCL4, and the diagonal that also serves it was RCL4 too, so
  // the upgrader haul ran over bare ground from RCL2 to RCL4.
  //
  // NO ROOM LIST HERE ANY MORE, ON PURPOSE. This comment used to name all 27
  // rooms and their tiles. That list was a snapshot of one artifact, the fleet
  // has been re-planned several times since, and a stale list of rooms reads
  // exactly like a live one. `--census` prints the current counts and the tiles
  // are in the shipped `roadStage` array; a reader who wants the rooms should
  // ask the artifact, not this file.
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

  // ---------------------------------------------------------------------
  // WHAT CONDUCTS: WHAT A CREEP CAN STAND ON. NOTHING ELSE.
  //
  // This set used to be ["storage", "spawn", "container"] — described as "the
  // generous reading, exactly as the bot's auditRoadPrefix has it, so we only
  // ever bridge a gap the bot would also call a gap". Both halves were true and
  // the premise was wrong: STRUCTURE_SPAWN and STRUCTURE_STORAGE are in the
  // engine's OBSTACLE_OBJECT_TYPES. No creep has ever stood on either of them.
  // A hauler cannot walk THROUGH the storage to get from one side of the hub to
  // the other, and a road network that is "connected" only because the graph let
  // it cross a spawn is not connected.
  //
  // The cost of that was invisible by construction, because the BRIDGE PASS
  // below and the CHECK (`stagedOrphans`) shared the wrong graph — so the check
  // could never catch the pass. Re-derived over walkable conductors only, at
  // stage <= 3 over all 172 rooms, 57 arterial road tiles across 18 rooms sit
  // [r22-waived: the DEFECT this pass fixed, measured on the build it was found
  // on. The live figure is the per-RCL audit table printed by --census.]
  // behind a 1-2 tile unpaved gap, and one of them is an ECO TERMINAL: E7S4's
  // source container 37,12, where the spawn at 31,17 sits between the stage-3
  // roads at 30,17 and 32,17. The claim this staging is sold on — "0 unreachable
  // eco terminals at stage <= 3" — was 1, not 0, and the check that produced the
  // 0 was standing on the same spawn.
  //
  // A container is genuinely walkable (it is not an obstacle) so it stays. The
  // SEED moves with the rule: the hub tile a creep actually occupies is the
  // SITTER, not the storage it withdraws from.
  //
  // ...AND ONLY THE CONTAINERS THAT EXIST YET. Round 11 fixed WHICH TYPES
  // conduct and left WHEN alone, so this set was still built from the raw
  // `plan.structures.container` array — all four tiles — while this whole pass
  // is deciding an RCL3 staging, and PlanV2.plannedTilesFor does not let a room
  // build the mineral container until RCL6. The bridge BFS was therefore free to
  // route an arterial THROUGH a container that will not exist for three more
  // levels, and then declare the chain already free. Same shape of error as the
  // spawn above, same invisibility: `stagedOrphans` checked the result on the
  // same over-generous graph. See containersForRcl.
  // ---------------------------------------------------------------------
  const conduct = new Set();
  for (const t of containersForRcl(plan, ARTERIAL_RCL)) conduct.add(t.x + t.y * 50);
  const seedTile = plan.sitter || (plan.structures.storage || [])[0];
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
  // never a seed of that loop, and the layer-1 eco line can stop a handful of
  // tiles short of the terminal it was laid for with nothing noticing.
  //
  // Small gaps, and that is the point: 1 to 3 tiles, at the end of a 30-tile
  // arterial the room paid for in full, on the exact tile a hauler stands on
  // every single cycle from RCL2. A far miner walking the last 3 tiles of its
  // haul over bare ground until RCL4, while the other 40 tiles of that same line
  // are roaded at RCL3, is the whole finding.
  //
  // The fix is the same machinery, one more set of seeds: run the 0-1 BFS's
  // parent chain from each eco terminal too. Because the BFS charges 1 per
  // not-yet-arterial road tile and 0 for arterials and conductors, the chain it
  // returns is a CHEAPEST one — the fewest new RCL3 tiles that join this
  // terminal to what the room is already building. Not a blanket promotion:
  // `--census` prints the count on its "eco-terminal reach chains" line, and it
  // is small, because most rooms
  // already reach all three terminals and pay nothing, and several of the ones
  // that do not have already been paid for by the container-face pass above and
  // its bridging.
  //
  // ...AND THE GRAPH IT ASKS THE QUESTION ON IS NOW THE RIGHT ONE. Until round
  // 10 both this pass and its check let a creep walk through the spawn and the
  // storage, and the claim published off it — "0 unreachable eco terminals at
  // stage <= 3" — was 1: E7S4's source container 37,12, with the spawn at 31,17
  // between the stage-3 roads at 30,17 and 32,17. Fleet-wide 57 stage-3 tiles
  // across 18 rooms sat behind such a gap. See the `conduct` note above.
  //
  // AND IT WAS STILL NOT 0 AFTER THAT, WHICH IS THE POINT. Round 10 fixed WHICH
  // TYPES conduct and republished "0 unreachable eco terminals"; round 13 fixed
  // WHEN they conduct (containersForRcl) and it was 1 — E5S1's controller
  // container 28,33, reachable at RCL3 only by standing on the mineral container
  // at 29,30 that PlanV2 does not build until RCL6. This pass could not repair
  // it: its 0-1 BFS never reached 28,33's neighbourhood at all on the honest
  // graph, so there was no parent chain to promote and nothing here invents a
  // road the planner did not place. It was a PLANNER finding surfaced by an
  // honest audit, and it was left visible in `--census` and in the push warning
  // rather than hidden behind a conductor that does not exist yet — and the
  // PLANNER then answered it, by paving the join. `--census` now prints E5S1
  // (28,30) on its RCL-deferred conduct line and 0 unreachable eco terminals in
  // 0 rooms at every one of RCL 3..8. The lesson to keep: each
  // time this number was published as 0 it was 0 because the checker was
  // standing on the same wrong graph as the pass — not because the rooms were
  // fine. Do not publish this figure again without asking what the checker is
  // allowed to walk on.
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
  // [r22-waived: the DEFECT this seeding fixed, measured on the build it was
  // found on — the promotion no longer happens, so nothing re-derives it.]
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
 * never reaches the segment. Returns the staged road tiles the hub cannot walk
 * to AT `rcl` — as {x,y} objects, because "3 tiles in 2 rooms" is a number that
 * cannot be acted on and a tile list is.
 *
 * TWO WAYS THIS FUNCTION USED TO LIE, BOTH FIXED HERE:
 *
 * (1) IT SHARED ITS GRAPH WITH THE THING IT AUDITS. The conductor set was built
 * from the raw `plan.structures.container` array, exactly as roadStageFor's
 * bridge BFS was, so when that pass decided a chain was already reachable by
 * standing on a container the room has not built yet, this check stood on the
 * same container and agreed. An audit that shares its graph with the pass it
 * audits reports zero by construction — it is not measuring the pass, it is
 * re-running it. That is how the round-10 spawn bug and this round's mineral
 * container both shipped with a green check next to them. The conductor set now
 * comes from containersForRcl(plan, rcl) and from nowhere else.
 *
 * (2) IT WAS ONLY EVER CALLED AT RCL3. `--census` and the push path both passed
 * ARTERIAL_RCL and stopped, so RCL4 through RCL8 — every level the room spends
 * the overwhelming majority of its life at — were completely unaudited. That is
 * not a safe omission just because stage only holds 3 and 4: the CONDUCTOR set
 * changes with RCL independently of the road set (the mineral container joins at
 * RCL6), so "reachable at RCL3" and "reachable at RCL5" are different questions
 * with different answers, and nothing was asking the second one. Both callers
 * now sweep 3..8 and report per level.
 */
/** every RCL at which a road may exist (typeAllowedAtRcl gates road at >= 3) —
 *  the full range both audits below sweep, not just the arterial level */
const AUDIT_RCLS = [3, 4, 5, 6, 7, 8];

/**
 * ---------------------------------------------------------------------------
 * A PUBLISHED PAVING GAP IS A CLAIM, AND THIS SIDE CHECKS IT BEFORE SPENDING IT.
 *
 * Both audits below grant `meta.walls.conductBridge.gapTiles` conductor status:
 * the tile is bare floor a creep walks at 2 ticks instead of 1, so it joins the
 * network even though no road may be built on it. That grant WAS the strongest
 * thing a plan could say to these checks — it is the one input that can turn an
 * orphan into a connected tile — and it used to be taken on `Number.isInteger`
 * alone. Any meta entry naming any coordinate was believed. It is granted to
 * nothing now; the paragraph below is why.
 *
 * validate.mjs holds the same declaration to the same rule (search PAVING GAP
 * REFUSED) and FAILS the room when it publishes one at all. But validate is a
 * separate program: push-plan.mjs runs standalone against out-v2/plans-hub.json,
 * on the VPS path against a plan this machine just produced in memory, and
 * nothing in either path makes the validator a prerequisite. One bogus meta
 * entry — a hand-edit, a mutation-test artifact, a planner regression that names
 * the wrong tile — would launder an orphan straight through `--census` and out
 * the other side as a green line. The census is the channel this whole staging
 * is published on; a channel that believes its input is not an audit.
 *
 * ROUND 14: THE RULE IS "NO", AND THE RULE THIS REPLACES WAS BACKWARDS.
 *
 * What stood here mirrored validate.mjs's F1 clause: a gap tile is granted iff
 * it carries an OBSTACLE structure (spawn, lab, storage, …) or a room object,
 * and denied otherwise. Read that sentence next to what a grant MEANS — this
 * function's return value is added to `conduct`, the walkable set the RCL orphan
 * sweep and the unreachable-terminal sweep flood over — and it says: a tile with
 * a SPAWN on it conducts creeps. It does not. A creep cannot stand on a spawn;
 * that is what OBSTACLE_OBJECT_TYPES means. A reviewer published E11S1's spawn
 * 26,41, storage 24,41 and lab 24,32 as gap tiles and this function granted all
 * three, so both audits walked straight through the spawn — which is criticism
 * 6/15's original defect, recreated inside the check that was written to stop
 * it.
 *
 * AND THERE IS NO SMALLER FIX, because the honest case does not exist. A gap
 * tile has to be WALKABLE (or it conducts nothing) and UNPAVEABLE (or it is a
 * road the producer declined to lay). In Screeps those two sets do not
 * intersect: the engine refuses a road only on natural wall, which is not
 * walkable; every obstacle that forbids the road also forbids the creep; and
 * road, container and rampart are not obstacles at all — road and container
 * share a tile in the fleet, and how many tiles in how many rooms is on the
 * "road+container coincidences" line of `--census` rather than typed here.
 * [r22-waived: the sentence below QUOTES the rotted figure as the finding's own
 * evidence — correcting it would delete the finding.] (It
 * said "60 tiles across 53 shipped rooms" for two rounds against a true 62/55,
 * on a line eight hundred lines below this file's own rule that every number in
 * prose has to be printed by something. Mm5, round 22.) "Walkable but
 * unpaveable" is the empty set. So this function GRANTS NOTHING, ever, and says why on every tile
 * it is asked about.
 *
 * The room's honest options are unchanged: pave the join, or let the audit
 * report the stranded conductors. What is gone is being handed a network by
 * naming a tile nothing can stand on.
 *
 * ZERO ON THE CURRENT FLEET — no room in the 172 publishes a gap at all, so this
 * is dormant by construction and every warning line it can print is a line about
 * a plan that does not exist yet. That is the point: the check is cheap, and the
 * alternative is a trust boundary that holds only while the number stays 0.
 * ---------------------------------------------------------------------------
 */
/** OBSTACLE_OBJECT_TYPES, as validate.mjs's `BLOCKING` has it — the structures
 *  a creep cannot walk over and a road cannot be built under. Roads, containers
 *  and ramparts are deliberately absent. */
const BLOCKING = [
  "spawn",
  "extension",
  "tower",
  "storage",
  "terminal",
  "link",
  "lab",
  "nuker",
  "observer",
  "extractor",
];
/** room+tile pairs already warned about — each audit calls this once per RCL
 *  (12 times per room per census run) and the finding is one per tile */
const gapWarned = new Set();

function verifiedGapTiles(plan) {
  const published = (plan.meta?.walls?.conductBridge?.gapTiles || []).filter(
    (t) => t && Number.isInteger(t.x) && Number.isInteger(t.y),
  );
  if (!published.length) return [];
  const s = plan.structures || {};
  const k = (t) => t.x + t.y * 50;
  const roads = new Set((s.road || []).map(k));
  const obstacles = new Set();
  for (const o of plan.sources || []) if (o && Number.isInteger(o.x)) obstacles.add(k(o));
  for (const o of [plan.controller, plan.mineral]) {
    if (o && Number.isInteger(o.x)) obstacles.add(k(o));
  }
  for (const ty of BLOCKING) for (const p of s[ty] || []) obstacles.add(k(p));
  for (const t of published) {
    const tk = k(t);
    const carried = Object.keys(s).filter((ty) => (s[ty] || []).some((p) => k(p) === tk));
    const reason = roads.has(tk)
      ? "it already carries a planned road, so it is not a gap in anything"
      : obstacles.has(tk)
        ? `it carries ${carried.join("+") || "a room object"} — a creep cannot stand on an OBSTACLE, so ` +
          "granting it as a conductor would let the orphan sweep walk through the spawn"
        : `it carries ${carried.join("+") || "nothing"} and no obstacle — a road can simply be built on ` +
          "it (road/container/rampart are NOT obstacles; a natural-wall tile carries nothing either, and " +
          "a creep cannot stand on one)";
    const id = `${plan.room} ${t.x},${t.y}`;
    if (!gapWarned.has(id)) {
      gapWarned.add(id);
      console.warn(
        `WARNING ${plan.room}: meta.walls.conductBridge.gapTiles names ${t.x},${t.y} but ${reason}. ` +
          `NOT granted as a conductor — NO gap tile is: walkable-but-unpaveable is the empty set in ` +
          `Screeps, so a published gap can never legitimately conduct. The audits below run without it. ` +
          `Run tools/plan-suite/v2/validate.mjs on this room: it fails a plan over exactly this ` +
          `(PAVING GAP REFUSED).`,
      );
    }
  }
  return [];
}

/**
 * ...AND THE ONE GAP A ROAD CANNOT CLOSE, READ OFF THE PLAN.
 *
 * The planner re-derives this same graph and PAVES the join where a join can be
 * paved (see bridgeDeferredConduct in layer-walls). It paves ALL of them on this
 * fleet: `--census` prints 3 room(s) PAVED the join — E2S5(27,23) E5S1(28,30)
 * E5S3(32,11) — and 0 room(s) publishing a paving gap. The first and third of
 * those are the two this paragraph used to call unpaveable: E5S3's north-east
 * extension pocket meets the rest of its network on the single tile 32,11, and
 * E2S5's eastern run on 27,23, and each of those tiles is where that room's
 * mineral container goes. The reason given for calling them unpaveable — one
 * structure per tile — was wrong: road and container are BOTH non-obstacle and
 * legally share a tile, so the planner simply laid the road under the container
 * and both rooms now carry a road and a container on that one tile.
 *
 * (This sentence said ONE room, then TWO, and neither count was ever derived
 * from anything. It is written out here because a reader wants the shape of the
 * exception, and the COUNT is printed by `--census`; if the two ever disagree
 * again, believe the census.)
 *
 * A creep still walks it: containers are not obstacles and neither is bare
 * floor, so the cost is one extra tick per crossing and nothing is unreachable.
 * That is a PAVING GAP and it is a different fact from an orphan, so it is
 * reported as one — read out of the plan's own published record, which the
 * validator re-derives from terrain and fails the room over if it is not true.
 * The alternative is a guarantee that says "0 orphans" by quietly meaning
 * something narrower, which is the shape of defect this whole audit exists for.
 */
function stagedOrphans(plan, stage, rcl) {
  const roads = plan.structures.road || [];
  const selected = roads.filter((r, i) => stage[i] <= rcl);
  // WALKABLE CONDUCTORS ONLY, AND ONLY THE ONES THAT EXIST AT `rcl` — see the
  // long note over `conduct` in roadStageFor and over containersForRcl, plus
  // the UNPAVED tiles the plan publishes as a paving gap. Those are bare floor
  // a creep walks at 2 ticks instead of 1; they conduct because a creep does not
  // need a road. And the claim is CHECKED before it is spent, not assumed —
  // see verifiedGapTiles; this used to believe any meta entry carrying an
  // integer x, which is the one input that can turn an orphan into a pass.
  const conduct = new Set(selected.map((t) => t.x + t.y * 50));
  for (const t of containersForRcl(plan, rcl)) conduct.add(t.x + t.y * 50);
  for (const t of verifiedGapTiles(plan)) conduct.add(t.x + t.y * 50);
  const seedTile = plan.sitter || (plan.structures.storage || [])[0];
  if (!seedTile) return [];
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
  return selected.filter((t) => !seen.has(t.x + t.y * 50));
}

/**
 * Can a creep walk from the sitter to every eco terminal using only the
 * structures that exist at `rcl`? Returns the terminals it cannot reach.
 *
 * This is the claim the whole staging is SOLD on, and it lived inline in
 * `census()` as a hand-inlined copy of the BFS in `stagedOrphans` — with, of
 * course, the same raw-container conductor set, so the check and the pass agreed
 * with each other for the same reason two copies of a wrong number agree. It is
 * a function now, called at every RCL 3..8, because the terminal set itself
 * MOVES with the RCL: below RCL6 there are three terminals and the mineral
 * container is neither a terminal nor a stepping stone; from RCL6 it is both.
 *
 * ...AND THE MINERAL SEAT IS NOT HELD TO IT, BECAUSE THE PLAN SAYS SO OUT LOUD.
 *
 * Honest conductors made this check true and immediately made it wrong in the
 * other direction: from RCL6 the mineral container is a terminal, and the
 * planner deliberately lays NO ROAD to it in 133 of 172 rooms. That is not an
 * oversight, it is a priced decision with a declaration attached — the plan
 * files `{gate:"misc", kind:"off-network"}` naming the seat tile, and the
 * validator's own road gate reads exactly that declaration to grant exactly this
 * exemption (a mineral is one deposit on a 50,000-tick cooldown; the walk saved
 * does not pay a road's decay). Counting those 133 as staging failures would be
 * this check reporting a decision the plan already reported, in a channel that
 * cannot tell the two apart.
 *
 * So the exemption is READ, never assumed: a mineral seat that has NOT declared
 * itself is held to the rule like every other terminal, which is the same split
 * the validator draws. One declaration, honoured by both readers.
 */
function unreachableTerminals(plan, stage, rcl) {
  const declaredOffNetwork = new Set();
  for (const sf of plan.meta?.shortfalls || []) {
    if (!sf || sf.gate !== "misc" || sf.kind !== "off-network") continue;
    for (const t of sf.tiles || []) {
      if (t && Number.isInteger(t.x) && Number.isInteger(t.y)) declaredOffNetwork.add(t.x + t.y * 50);
    }
  }
  // BUILT is one question, CHECKED is another. Everything standing at this RCL
  // conducts — a container a creep can walk over is a container a creep can walk
  // over, declaration or not — but only the terminals the plan has NOT excused
  // are held to the reachability rule.
  const built = containersForRcl(plan, rcl);
  const terminals = built.filter((t) => !declaredOffNetwork.has(t.x + t.y * 50));
  if (!terminals.length) return [];
  const conduct = new Set(
    (plan.structures.road || []).filter((r, i) => stage[i] <= rcl).map((t) => t.x + t.y * 50),
  );
  for (const t of built) conduct.add(t.x + t.y * 50);
  // ...and the published paving gap, for the same reason stagedOrphans honours
  // it: a creep walks bare floor. Re-derived here rather than believed — the
  // tile has to actually be unpaveable, see verifiedGapTiles.
  for (const t of verifiedGapTiles(plan)) conduct.add(t.x + t.y * 50);
  const seedTile = plan.sitter || (plan.structures.storage || [])[0];
  if (!seedTile) return [];
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
  return terminals.filter((t) => !seen.has(t.x + t.y * 50));
}

/**
 * ---------------------------------------------------------------------------
 * THE FLEET CENSUS — because a number quoted in a comment is a number that rots.
 * ---------------------------------------------------------------------------
 * Every count this file's header states about the staging ("29 tiles, 27 rooms",
 * "7,870 of 14,053") was hand-transcribed from an off-line re-derivation of a
 * fleet that has since been re-planned four times, and round 10 caught two of
 * them wrong by one. They are all derivable from `plans-hub.json` by running the
 * same functions the push runs, so:
 *
 *   node tools/server/push-plan.mjs --census
 *
 * prints them, and the header quotes what it prints. Same rule the goal document
 * now follows: if a number appears in prose, something has to be able to print it.
 */
function census() {
  const plansPath = path.join(REPO, "tools", "plan-suite", "out-v2", "plans-hub.json");
  const plans = JSON.parse(fs.readFileSync(plansPath, "utf8"));
  let roads = 0;
  let arterial = 0;
  /**
   * PER-ROOM ARTERIAL SIZES, so the header does not have to transcribe four of
   * them by hand and get all four wrong. See the header's own rule: if a number
   * appears in prose, something has to be able to print it.
   */
  const arterialPerRoom = [];
  let c2Tiles = 0;
  let c2Rooms = 0;
  let ecoTiles = 0;
  let ecoRooms = 0;
  let bothTiles = 0;
  let bothRooms = 0;
  let bothMax = 0;
  let bothMaxRoom = null;
  let extFaced = 0;
  let bridged = 0;
  // one row per audited RCL — see AUDIT_RCLS
  const perRcl = {};
  for (const lvl of AUDIT_RCLS) {
    perRcl[lvl] = { orphanTiles: 0, orphanRooms: [], unreach: 0, unreachRooms: [], mineral: 0 };
  }
  // ...and the one figure in this file's header that NOTHING re-derived. It was
  // published as "220 RCL2 containers across 145 rooms" for two rounds, in this
  // file and in the goal document, and it was 218 across 143 when this line was
  // written — and 219 across 143 one planner change later, which is the point.
  // A number in prose that no tool prints rots exactly like a metric no gate
  // re-derives, so it is printed here, off the same rcl2Containers() the
  // staging itself uses, and this sentence keeps no live copy of it.
  let noFaceTiles = 0;
  let noFaceRooms = 0;
  // ...and the SAME question asked of all four containers the room plans, which
  // is the reading the goal document quotes alongside the RCL2 one. Two numbers,
  // two definitions, and the only way they stop being confused for each other is
  // if the same run prints both. (rcl2Containers defers the mineral container to
  // RCL6; the difference between the two lines below is exactly that tile.)
  let allFaceTiles = 0;
  let allFaceRooms = 0;
  let allFaceMineral = 0;
  // THE "0 DEMOTED" CLAIM, ACTUALLY DERIVED. The goal document states that this
  // pass only ever RE-STAGES roads the planner already placed and never pushes
  // one LATER than the provenance split would have put it — and cited --census
  // as the thing that prints it. Nothing printed it. The base split is
  // recomputed here from meta.roadLayer and compared tile by tile against what
  // roadStageFor returned, so "0 demoted" is a measurement rather than a
  // property of the code that somebody once read.
  let promoted = 0;
  let demoted = 0;
  // Mm5 (round 22) — THE TWO FIGURES THIS HEADER KEPT RE-TYPING, PRINTED.
  // [r22-waived: this paragraph QUOTES both rotted figures verbatim, which is
  // the whole evidence for the two lines below existing; correcting them would
  // delete the finding.]
  //
  // "road and container share a tile in 60 tiles across 53 shipped rooms" (the
  // verifiedGapTiles header) and "+260 bytes on the largest (E12S6, 123 roads)"
  // (the roadStage header) were both hand-transcribed, both moved with the
  // fleet, and both were wrong by the time anybody read them — the second had
  // had one of its two halves updated and not the other. This file's own rule
  // is "if it is a number, something prints it"; these two were the numbers
  // nothing printed. Now something does, and the headers point here.
  let coincidenceTiles = 0;
  let coincidenceRooms = 0;
  const roadsPerRoom = [];
  for (const plan of plans) {
    if (!plan || !plan.structures) continue;
    {
      const roadKeys = new Set((plan.structures.road || []).map((r) => r.x + r.y * 50));
      const both = (plan.structures.container || []).filter((c) => roadKeys.has(c.x + c.y * 50)).length;
      if (both) {
        coincidenceTiles += both;
        coincidenceRooms++;
      }
      roadsPerRoom.push({ room: plan.room, n: roadKeys.size });
    }
    const stage = roadStageFor(plan);
    roads += stage.length;
    {
      const layer = (plan.meta && plan.meta.roadLayer) || {};
      (plan.structures.road || []).forEach((r, i) => {
        const base = (layer[`${r.x},${r.y}`] || 99) <= ARTERIAL_LAYER ? ARTERIAL_RCL : REST_RCL;
        if (stage[i] < base) promoted++;
        else if (stage[i] > base) demoted++;
      });
    }
    const arterialHere = stage.filter((s) => s <= ARTERIAL_RCL).length;
    arterial += arterialHere;
    arterialPerRoom.push({ room: plan.room, n: arterialHere, roads: (plan.structures.road || []).length });
    extFaced += stage.extFaced || 0;
    bridged += stage.bridged || 0;
    c2Tiles += stage.c2Faced || 0;
    if (stage.c2Faced) c2Rooms++;
    ecoTiles += stage.ecoGuarded || 0;
    if (stage.ecoGuarded) ecoRooms++;
    const both = (stage.c2Faced || 0) + (stage.ecoGuarded || 0);
    bothTiles += both;
    if (both) bothRooms++;
    if (both > bothMax) {
      bothMax = both;
      bothMaxRoom = plan.room;
    }
    // EVERY LEVEL, NOT JUST RCL3. Both of these used to be asked once, at
    // ARTERIAL_RCL, which quietly meant RCL4-8 — where a room spends nearly all
    // of its life — were never audited at all. `stage` only ever holds 3 or 4 so
    // the ROAD set stops changing after RCL4, but the CONDUCTOR set does not:
    // the mineral container arrives at RCL6 and changes both what a creep can
    // stand on and (from RCL6) what counts as a terminal it has to reach. Two
    // different questions, and only the first was being asked.
    for (const lvl of AUDIT_RCLS) {
      const row = perRcl[lvl];
      const orphans = stagedOrphans(plan, stage, lvl);
      if (orphans.length) {
        row.orphanTiles += orphans.length;
        row.orphanRooms.push(`${plan.room}(${orphans.map((t) => `${t.x},${t.y}`).join(" ")})`);
      }
      const bad = unreachableTerminals(plan, stage, lvl);
      if (bad.length) {
        row.unreach += bad.length;
        row.unreachRooms.push(`${plan.room}(${bad.map((c) => `${c.x},${c.y}`).join(" ")})`);
        // SPLIT OUT THE MINERAL CONTAINER, because from RCL6 it dominates this
        // column and it is a different KIND of finding. Derived from the same
        // containersForRcl rather than re-testing extractor adjacency, so there
        // is still exactly one definition of "the deferred container" on this
        // side: it is the tile that is in the RCL6 set and not in the RCL2 one.
        const early = new Set(rcl2Containers(plan).map((c) => c.x + c.y * 50));
        row.mineral += bad.filter((c) => !early.has(c.x + c.y * 50)).length;
      }
    }
    {
      const roadKeys = new Set((plan.structures.road || []).map((r) => r.x + r.y * 50));
      const noFace = rcl2Containers(plan).filter(
        (c) =>
          !roadKeys.has(c.x + 1 + c.y * 50) &&
          !roadKeys.has(c.x - 1 + c.y * 50) &&
          !roadKeys.has(c.x + (c.y + 1) * 50) &&
          !roadKeys.has(c.x + (c.y - 1) * 50),
      );
      if (noFace.length) {
        noFaceTiles += noFace.length;
        noFaceRooms++;
      }
      const early = new Set(rcl2Containers(plan).map((c) => c.x + c.y * 50));
      const noFaceAll = (plan.structures.container || []).filter(
        (c) =>
          !roadKeys.has(c.x + 1 + c.y * 50) &&
          !roadKeys.has(c.x - 1 + c.y * 50) &&
          !roadKeys.has(c.x + (c.y + 1) * 50) &&
          !roadKeys.has(c.x + (c.y - 1) * 50),
      );
      if (noFaceAll.length) {
        allFaceTiles += noFaceAll.length;
        allFaceRooms++;
        allFaceMineral += noFaceAll.filter((c) => !early.has(c.x + c.y * 50)).length;
      }
    }
  }
  console.log(`push-plan road-staging census over ${plans.length} rooms`);
  console.log(`  arterial (stage <= ${ARTERIAL_RCL}): ${arterial} of ${roads} road tiles`);
  {
    const sorted = arterialPerRoom.slice().sort((x, y) => x.n - y.n);
    const q = (frac) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * frac))];
    const worst = sorted[sorted.length - 1];
    console.log(
      `  ARTERIAL SIZE per room: min ${sorted[0].n} (${sorted[0].room}) · median ${q(0.5).n} · ` +
        `p90 ${q(0.9).n} · max ${worst.n} of ${worst.roads} (${worst.room})`,
    );
  }
  // Mm5 (round 22) — see the block that accumulates these. Both lines exist so
  // the two file headers above can point at a printed number instead of holding
  // a copy of one.
  console.log(
    `  road+container coincidences: ${coincidenceTiles} tiles across ${coincidenceRooms} rooms ` +
      `(a road and a container legally share a tile — this is the set the "walkable but unpaveable" ` +
      `argument in the verifiedGapTiles header rests on)`,
  );
  {
    const sorted = roadsPerRoom.slice().sort((x, y) => x.n - y.n);
    const q = (frac) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * frac))];
    const worst = sorted[sorted.length - 1];
    const bytes = (n) => 2 * n + 12;
    console.log(
      `  roadStage payload (2N+12 bytes on N roads): min ${bytes(sorted[0].n)}B (${sorted[0].room}, ` +
        `${sorted[0].n} roads) · median ${bytes(q(0.5).n)}B (${q(0.5).n} roads) · max ` +
        `${bytes(worst.n)}B (${worst.room}, ${worst.n} roads)`,
    );
  }
  console.log(`  extension[0..${RCL3_EXTENSIONS - 1}] faces promoted: ${extFaced}`);
  console.log(`  RCL2-container faces promoted: ${c2Tiles} tiles across ${c2Rooms} rooms`);
  console.log(`  eco-terminal reach chains: ${ecoTiles} tiles across ${ecoRooms} rooms`);
  console.log(
    `  the two container passes together: ${bothTiles} tiles across ${bothRooms} rooms, max ` +
      `${bothMax} in one room (${bothMaxRoom})`,
  );
  console.log(`  bridge repair: ${bridged} tiles`);
  // PER RCL, AND NAMING THE TILES. A single "0 tiles in 0 rooms" line at RCL3
  // was the entire published evidence for this staging being sound, and it was
  // 0 partly because it was measured on the pass's own graph and partly because
  // nobody asked about RCL4-8 at all. A per-level table with the rooms and tiles
  // in it cannot be summarised into a green tick by accident.
  console.log(`  per-RCL audit (walkable conductors: road + container-at-that-RCL, seeded at the sitter):`);
  for (const lvl of AUDIT_RCLS) {
    const row = perRcl[lvl];
    console.log(
      `    RCL${lvl}: staged road orphans ${row.orphanTiles} tiles in ${row.orphanRooms.length} rooms` +
        (row.orphanRooms.length ? ` — ${row.orphanRooms.join(" ")}` : "") +
        `; unreachable eco terminals ${row.unreach} in ${row.unreachRooms.length} rooms` +
        (row.mineral ? ` (${row.mineral} of them the mineral container)` : "") +
        (row.unreachRooms.length ? ` — ${row.unreachRooms.join(" ")}` : ""),
    );
  }
  console.log(`  re-staged: ${promoted} tiles promoted, ${demoted} demoted`);
  console.log(
    `  RCL2 containers with NO planned D4 road face (a planner question, not a staging one): ` +
      `${noFaceTiles} across ${noFaceRooms} rooms`,
  );
  console.log(
    `  ...and the ALL-FOUR-CONTAINERS reading of the same question: ${allFaceTiles} across ` +
      `${allFaceRooms} rooms (${allFaceTiles - allFaceMineral} RCL2 + ${allFaceMineral} mineral-only)`,
  );
  // THE PAVING GAPS, COUNTED — see the header over pavingGapTiles. The header
  // used to state the count in prose ("One room in the fleet…") and it was wrong
  // within the same round, because nothing derived it. Now something does.
  {
    const gaps = plans
      .filter((p) => (p.meta?.walls?.conductBridge?.gapTiles || []).length)
      .map((p) => {
        const cb = p.meta.walls.conductBridge;
        return `${p.room}(${cb.gapTiles.map((t) => `${t.x},${t.y}`).join(" ")}; ${(cb.stranded || []).length} road tile(s) behind it)`;
      });
    const paved = plans
      .filter((p) => (p.meta?.walls?.conductBridge?.added || []).length)
      .map((p) => `${p.room}(${p.meta.walls.conductBridge.added.map((t) => `${t.x},${t.y}`).join(" ")})`);
    // WHAT A PUBLISHED GAP IS WORTH, SAID ON THE LINE THAT PRINTS THE COUNT.
    // The sentence here used to define a gap as "a tile carrying an OBSTACLE
    // structure … i.e. a tile no road may ever be built on", and that half of
    // the definition is right and useless, because the OTHER half — a creep has
    // to WALK the tile for the gap to close anything — excludes exactly the same
    // tiles. A gap is never granted now (see verifiedGapTiles); the line says so
    // rather than implying a class of gaps that would be honoured.
    console.log(
      `  RCL-deferred conduct: ${paved.length} room(s) PAVED the join${paved.length ? ` — ${paved.join(" ")}` : ""}` +
        `; ${gaps.length} room(s) publish a PAVING GAP${gaps.length ? ` — ${gaps.join(" ")}` : ""} ` +
        `(a gap tile is a claim that a creep walks a tile no road can be built on, and in Screeps that ` +
        `is the EMPTY SET — the engine refuses a road only on natural wall, which is not walkable, and ` +
        `every obstacle that forbids the road forbids the creep. Container and road share a tile, so a ` +
        `container tile is paved. NO published gap is granted as a conductor by this program)`,
    );
    // ...AND HOW MANY CLAIMS THIS RUN REFUSED. Every published gap tile is
    // refused, so this is the published count; it stays on the census line so a
    // reader of the summary sees it without scrolling, and it is silent at 0,
    // which is what the whole fleet is.
    let denied = 0;
    for (const p of plans) {
      const pub = (p.meta?.walls?.conductBridge?.gapTiles || []).length;
      if (pub) denied += pub - verifiedGapTiles(p).length;
    }
    if (denied) {
      console.log(
        `  ...of which ${denied} published gap tile(s) were NOT granted as conductors — no gap tile is, ` +
          `so the audits above ran without every one of them. See the WARNING lines.`,
      );
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--census")) return census();
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
  // EVERY RCL, WITH THE TILES. This warned once, at RCL3, with a bare count —
  // so a room whose network only breaks at RCL5 pushed silently, and a room that
  // did warn told you a number you could not go and look at. Both audits are
  // cheap (one BFS over ~130 tiles each) and this runs once per push.
  for (const lvl of AUDIT_RCLS) {
    const orphans = stagedOrphans(plan, roadStage, lvl);
    if (orphans.length) {
      // The bot logs this same count at RCL3 and then builds the stubs anyway.
      // Better to see it here, once, with the room in front of you.
      console.warn(
        `WARNING ${room}: ${orphans.length} staged RCL${lvl} road tiles are not connected to ` +
          `the hub — ${orphans.map((t) => `${t.x},${t.y}`).join(" ")}`,
      );
    }
    const stranded = unreachableTerminals(plan, roadStage, lvl);
    if (stranded.length) {
      console.warn(
        `WARNING ${room}: ${stranded.length} eco terminals a creep cannot reach at RCL${lvl} — ` +
          stranded.map((c) => `${c.x},${c.y}`).join(" "),
      );
    }
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

export {
  roadStageFor,
  stagedOrphans,
  unreachableTerminals,
  containersForRcl,
  // the two hardening helpers, exported for the same reason as everything else
  // here: an offline check that re-implements them proves nothing about what
  // ships. Both are dormant on the honest artifact (0 published gaps, 4
  // containers against a cap of 5), so a direct caller is the ONLY way to
  // exercise either of them at all.
  containerStageOrder,
  verifiedGapTiles,
  AUDIT_RCLS,
  ARTERIAL_RCL,
  ARTERIAL_LAYER,
  REST_RCL,
  RCL3_EXTENSIONS,
};
