/**
 * Push the auto-expand pack: a ranked target list + the planned layouts for
 * the best targets, so the bot can claim AND lay out a new room without the
 * offline planner being in the loop.
 *
 *   node tools/server/push-expansion-pack.mjs --user pacifist [--dest pserver]
 *                                            [--plans <plans-hub.json>] [--dry-run]
 *
 * Reads tools/plan-suite/out-v2/plans-hub.json (run plan.mjs first) and mongo
 * (who owns what), then writes:
 *
 *   segment 86      { targets: [{room, score, spawnPos, hash, seg}, ...] }  top 20
 *   segments 80-85  { "<room>": <adoption payload>, ... }                   top 12
 *
 * The per-room payload is byte-identical in SHAPE to what push-plan.mjs puts
 * in segment 88 — src/Managers/AutoExpand.ts hands it to the same packer that
 * adoptPlan() uses, so a freshly spawned room gets planV2 with zero drift.
 *
 * Segments 80-86 are deliberately below the planner's 88 (plan) and 89-99
 * (animator frames) so nothing here can clash with them.
 */
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, "..", "..");
const SEG_INDEX = 86;
const SEG_PLANS = [80, 81, 82, 83, 84, 85];
const PLANS_PER_SEG = 2; // 6 segments * 2 = the top 12
const TOP_TARGETS = 20;
const MIN_DIST = 2;
const MAX_DIST = 5;

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
    headers: { "Content-Type": "application/json", "X-Token": cfg.token, "X-Username": cfg.token },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok !== 1)
    throw new Error(`${method} ${endpoint}: ${res.status} ${JSON.stringify(json).slice(0, 200)}`);
  return json;
}

/** Game.map.getRoomLinearDistance, offline. */
function roomCoords(name) {
  const m = /^([WE])(\d+)([NS])(\d+)$/.exec(name);
  if (!m) return null;
  const x = m[1] === "W" ? -1 - Number(m[2]) : Number(m[2]);
  const y = m[3] === "N" ? -1 - Number(m[4]) : Number(m[4]);
  return { x, y };
}
function linDist(a, b) {
  const p = roomCoords(a);
  const q = roomCoords(b);
  if (!p || !q) return Infinity;
  return Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y));
}

/** djb2 — same marker push-plan.mjs writes, so re-adoption logs old->new. */
function planHash(structures) {
  const s = JSON.stringify(structures);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function score(plan, ownedRooms) {
  const meta = plan.meta || {};
  const shell = meta.shell || {};
  const cut = (shell.cut || []).length;
  const eco = (meta.pathSourcesSum || 0) + (meta.pathController || 0);
  let nearest = Infinity;
  for (const r of ownedRooms) nearest = Math.min(nearest, linDist(plan.room, r));
  const s =
    -cut * 1.2 -
    eco * 0.8 +
    (shell.deepTiles || 0) * 0.04 +
    (shell.enclosedController ? 4 : 0) +
    (shell.enclosedSources || 0) * 3 -
    (shell.priceyWall ? 5 : 0) -
    nearest * 2.5;
  return { s, nearest, cut, eco };
}

async function main() {
  const args = process.argv.slice(2);
  const dest = args.includes("--dest") ? args[args.indexOf("--dest") + 1] : "pserver";
  const username = args.includes("--user") ? args[args.indexOf("--user") + 1] : "pacifist";
  const dryRun = args.includes("--dry-run");
  const cfg = loadConfig(dest);
  const { token, userId } = tokenForUser(username);
  cfg.token = token;

  // who owns what, straight from the world DB
  const rawOwned = mongoEval(
    `db = db.getSiblingDB("screeps"); print(JSON.stringify({
       mine: db["rooms.objects"].distinct("room", {type: "controller", user: ${JSON.stringify(userId)}}),
       taken: db["rooms.objects"].distinct("room", {type: "controller", user: {$ne: null}})
     }))`,
  );
  const { mine, taken } = JSON.parse(rawOwned.slice(rawOwned.indexOf("{")));
  const takenSet = new Set(taken);
  if (!mine.length) throw new Error(`${username} owns no rooms — nothing to expand from`);

  // --plans lets you point at a snapshot while the planner rewrites the live file
  const plansPath = args.includes("--plans")
    ? args[args.indexOf("--plans") + 1]
    : path.join(REPO, "tools", "plan-suite", "out-v2", "plans-hub.json");
  const plans = JSON.parse(fs.readFileSync(plansPath, "utf8"));

  const ranked = [];
  for (const plan of plans) {
    if (!plan || !plan.room || plan.error || !plan.structures) continue;
    if (!plan.structures.spawn || !plan.structures.spawn.length) continue;
    if (takenSet.has(plan.room)) continue; // owned or reserved by somebody
    const sc = score(plan, mine);
    if (sc.nearest < MIN_DIST || sc.nearest > MAX_DIST) continue;
    ranked.push({ plan, ...sc });
  }
  ranked.sort((a, b) => b.s - a.s);
  if (!ranked.length) throw new Error(`no claimable room within ${MIN_DIST}-${MAX_DIST} of ${mine.join(",")}`);

  const top = ranked.slice(0, TOP_TARGETS);
  const targets = top.map((r, i) => {
    const seg = i < SEG_PLANS.length * PLANS_PER_SEG ? SEG_PLANS[Math.floor(i / PLANS_PER_SEG)] : undefined;
    const t = {
      room: r.plan.room,
      score: Number(r.s.toFixed(2)),
      spawnPos: r.plan.structures.spawn[0],
      hash: planHash(r.plan.structures),
    };
    if (seg !== undefined) t.seg = seg;
    return t;
  });

  // segment 86: the ranking. Keep it small — the bot reads it every expansion.
  const indexPayload = { targets, owner: username, pushedAt: Date.now() };
  const indexData = JSON.stringify(indexPayload);

  // segments 80-85: room -> adoption payload (same shape as push-plan.mjs)
  const segData = {};
  for (let i = 0; i < top.length && i < SEG_PLANS.length * PLANS_PER_SEG; i++) {
    const plan = top[i].plan;
    const seg = SEG_PLANS[Math.floor(i / PLANS_PER_SEG)];
    (segData[seg] = segData[seg] || {})[plan.room] = {
      room: plan.room,
      structures: plan.structures,
      sitter: plan.sitter,
      labInputs: plan.labInputs,
      shellCut: (plan.meta && plan.meta.shell && plan.meta.shell.cut) || [],
      planHash: planHash(plan.structures),
      pushedAt: Date.now(),
    };
  }

  console.log(`owned: ${mine.join(",")} · claimable candidates ${ranked.length}`);
  console.log("rank  room     score   dist  cut  eco  enclCtrl encSrc pricey  spawn");
  top.slice(0, 8).forEach((r, i) => {
    const sh = (r.plan.meta && r.plan.meta.shell) || {};
    const sp = r.plan.structures.spawn[0];
    console.log(
      `${String(i + 1).padStart(4)}  ${r.plan.room.padEnd(7)} ${r.s.toFixed(2).padStart(7)} ${String(r.nearest).padStart(4)} ` +
        `${String(r.cut).padStart(4)} ${String(r.eco).padStart(4)} ${String(!!sh.enclosedController).padStart(8)} ` +
        `${String(sh.enclosedSources || 0).padStart(6)} ${String(!!sh.priceyWall).padStart(6)}  ${sp.x},${sp.y}`,
    );
  });

  if (dryRun) {
    console.log(`dry run — index ${indexData.length}B, plan segments: ` +
      Object.entries(segData).map(([s, m]) => `${s}:${JSON.stringify(m).length}B(${Object.keys(m).join("+")})`).join(" "));
    return;
  }

  for (const [seg, map] of Object.entries(segData)) {
    const data = JSON.stringify(map);
    if (data.length > 100 * 1024) throw new Error(`segment ${seg} too big: ${data.length}`);
    await api(cfg, "POST", "/api/user/memory-segment", { segment: Number(seg), data });
    console.log(`segment ${seg} <- ${Object.keys(map).join(", ")} (${data.length} bytes)`);
  }
  await api(cfg, "POST", "/api/user/memory-segment", { segment: SEG_INDEX, data: indexData });
  const back = await api(cfg, "GET", `/api/user/memory-segment?segment=${SEG_INDEX}`);
  const verify = JSON.parse(back.data || "{}");
  if (!verify.targets || verify.targets[0].room !== targets[0].room) throw new Error("segment 86 verify failed");
  console.log(
    `segment ${SEG_INDEX} <- ${targets.length} targets (${indexData.length} bytes), best ${targets[0].room} ` +
      `score ${targets[0].score} spawn ${targets[0].spawnPos.x},${targets[0].spawnPos.y}`,
  );
  console.log(`in the game console run: autoExpand()`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
