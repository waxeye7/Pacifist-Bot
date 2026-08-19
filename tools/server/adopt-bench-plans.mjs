#!/usr/bin/env node
/**
 * Push the 16-room bench v2 pack into CANDIDATE (pacifist) segments 80–86.
 *
 *   fnm exec --using 22 node tools/server/adopt-bench-plans.mjs
 *   fnm exec --using 22 node tools/server/adopt-bench-plans.mjs --write
 *
 * Default is dry-run (reads hub, prints room → pack → score, writes nothing).
 * --write POSTs 80–86 as pacifist and sets Memory.features.autoExpand = false.
 *
 * This is the pack path (`runPackAdoption` in AutoExpand.ts). It does **not**
 * call adoptPlan() and never writes segment 88 or 98 (planner hub r44).
 * Never dest race / user pacifist-race. Refuses --write while
 * docs/speedrun-ledger/_SPEEDRUN-STATE.txt is watching (cycle-15).
 *
 * Put all 16 in candidate segments so a later --swap seed still adopts.
 * Control segments stay empty. Between races only — not mid-cycle.
 */
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import {
  roadStageFor,
  stagedOrphans,
  unreachableTerminals,
  AUDIT_RCLS,
  ARTERIAL_RCL,
} from "./push-plan.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, "..", "..");

const BENCH = [
  "E5S3",
  "E9S1",
  "E12S3",
  "E13S9",
  "E18S9",
  "E8S5",
  "E11S6",
  "E8S3",
  "E16S9",
  "E4S7",
  "E18S5",
  "E6S1",
  "E12S1",
  "E3S5",
  "E13S7",
  "E21S4",
];
const SEG_INDEX = 86;
const SEG_PLANS = [80, 81, 82, 83, 84, 85];
const PER = 3; // 16 rooms / 3 = 80–85; not the expansion-pack 2/seg
const FORBIDDEN_SEGS = new Set([88, 98]);
for (let s = 89; s <= 99; s++) FORBIDDEN_SEGS.add(s);

const ALLOWED_DEST = new Set(["pserver", "pacifist"]);
const CANDIDATE_USER = "pacifist";
const CONTROL_USER = "pacifist-race";
const CONTROL_DEST = "race";
const CONTROL_TOKEN = "local-pacifist-race-token-001";
const STATE_PATH = path.join(REPO, "docs", "speedrun-ledger", "_SPEEDRUN-STATE.txt");
const BENCH_JSON = path.join(REPO, "docs", "BENCHMARK-ROOMS.json");
const DEFAULT_PLANS = path.join(REPO, "tools", "plan-suite", "out-v2", "plans-hub.json");

const USAGE = `adopt-bench-plans.mjs — candidate-only 16-room bench pack → segments 80-86

  fnm exec --using 22 node tools/server/adopt-bench-plans.mjs [--dry-run]
  fnm exec --using 22 node tools/server/adopt-bench-plans.mjs --write

  --dry-run          default; print room → pack → score, write nothing
  --write            POST 80-86 as pacifist + autoExpand=false
  --dest pserver     only pserver|pacifist (default pserver)
  --user pacifist    only pacifist
  --plans <path>     default tools/plan-suite/out-v2/plans-hub.json

  Never: dest race, user pacifist-race, segments 88/98, --adopt, mid-race --write.
`;

function die(msg) {
  console.error("ERROR: " + msg);
  process.exit(1);
}

function parseArgs(argv) {
  const out = {
    write: false,
    dest: "pserver",
    username: CANDIDATE_USER,
    plans: DEFAULT_PLANS,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--write" || a === "--yes") out.write = true;
    else if (a === "--dry-run") out.write = false;
    else if (a === "--adopt") die("refusing --adopt (segment 88 / planner hub). Use the 80-86 pack.");
    else if (a === "--dest") out.dest = argv[++i];
    else if (a === "--user") out.username = argv[++i];
    else if (a === "--plans") out.plans = argv[++i];
    else die("unknown arg " + a + "\n" + USAGE);
  }
  return out;
}

function loadConfig(dest) {
  const all = JSON.parse(fs.readFileSync(path.join(REPO, "screeps.json"), "utf8"));
  const cfg = all[dest];
  if (!cfg) throw new Error(`no "${dest}" in screeps.json`);
  const port = cfg.port ? `:${cfg.port}` : "";
  const base = `${cfg.protocol || "http"}://${cfg.hostname}${port}${cfg.path || "/"}`.replace(/\/+$/, "");
  return { base, token: cfg.token, dest };
}

function assertCandidate(dest, username, cfg) {
  if (username !== CANDIDATE_USER) throw new Error(`refusing user ${username} — candidate (${CANDIDATE_USER}) only`);
  if (!ALLOWED_DEST.has(dest)) throw new Error(`refusing dest ${dest} — only ${[...ALLOWED_DEST].join("|")}`);
  if (dest === CONTROL_DEST || dest === CONTROL_USER) throw new Error("refusing control dest");
  if (/race/i.test(username) || /race/i.test(dest)) throw new Error("refusing race identity");
  if (cfg && (cfg.token === CONTROL_TOKEN || /race/i.test(cfg.token || ""))) {
    throw new Error("dest token is the control token");
  }
}

function raceWatching() {
  if (!fs.existsSync(STATE_PATH)) return { watching: false, phase: "(no _SPEEDRUN-STATE.txt)", run: "" };
  const text = fs.readFileSync(STATE_PATH, "utf8");
  const phase = (text.match(/^phase:\s*(.+)$/m) || [])[1] || "";
  const run = (text.match(/^run:\s*(.+)$/m) || [])[1] || "";
  const watching = /watch/i.test(phase) || /^watch:/m.test(text);
  return { watching, phase, run };
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
  if (username !== CANDIDATE_USER) throw new Error("refusing token lookup for " + username);
  const userId = mongoEval(
    `db = db.getSiblingDB("screeps"); var u = db.users.findOne({username: ${JSON.stringify(username)}}); print(u ? String(u._id) : "")`,
  );
  if (!userId) throw new Error(`user ${username} not found`);
  if (userId === CONTROL_USER || /race/i.test(userId)) throw new Error("user id resolved to control");
  for (const key of redis(["keys", "auth_*"]).split("\n").filter(Boolean)) {
    if (redis(["get", key]) === userId) return { token: key.slice("auth_".length), userId };
  }
  throw new Error("no redis token for " + username + " — will not mint");
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

function planHash(structures) {
  const s = JSON.stringify(structures);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** Same weights as push-expansion-pack.mjs, nearest=0 (bench is assigned, not ranked). */
function planScore(plan) {
  const meta = plan.meta || {};
  const shell = meta.shell || {};
  const cut = (shell.cut || []).length;
  const eco = (meta.pathSourcesSum || 0) + (meta.pathController || 0);
  const s =
    -cut * 1.2 -
    eco * 0.8 +
    (shell.deepTiles || 0) * 0.04 +
    (shell.enclosedController ? 4 : 0) +
    (shell.enclosedSources || 0) * 3 -
    (shell.priceyWall ? 5 : 0);
  return { s: Number(s.toFixed(2)), cut, eco };
}

function loadAssignments() {
  const bench = JSON.parse(fs.readFileSync(BENCH_JSON, "utf8"));
  const hardness = {};
  const defaultCand = new Set();
  const defaultCtrl = new Set();
  for (const slot of bench.slots || []) {
    const rooms = slot.rooms || {};
    if (rooms.candidate) defaultCand.add(rooms.candidate);
    if (rooms.control) defaultCtrl.add(rooms.control);
    for (const [name, p] of Object.entries(slot.profiles || {})) {
      if (p && typeof p.hardness === "number") hardness[name] = p.hardness;
    }
  }
  return { setHash: bench.setHash, defaultCand, defaultCtrl, hardness };
}

function ownLabel(room, asgn) {
  if (asgn.defaultCand.has(room)) return "cand-default";
  if (asgn.defaultCtrl.has(room)) return "cand-swap";
  return "?";
}

function parseSegment(raw) {
  if (!raw || raw === "null") return {};
  try {
    return JSON.parse(raw);
  } catch (e) {
    return { _parseError: e.message, _head: String(raw).slice(0, 80) };
  }
}

async function peekSegment(cfg, seg) {
  const back = await api(cfg, "GET", `/api/user/memory-segment?segment=${seg}`);
  return parseSegment(back.data);
}

function summarizeIndex(data) {
  if (!data || typeof data !== "object") return "(empty)";
  if (data._parseError) return `parse-fail ${data._parseError}`;
  const n = data.targets ? data.targets.length : 0;
  const rooms = data.targets ? data.targets.map((t) => t.room).join(",") : "";
  return `owner=${data.owner || "?"} bench=${!!data.bench} n=${n} ${rooms.slice(0, 80)}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(USAGE);
    process.exit(0);
  }

  const cfg = loadConfig(args.dest);
  assertCandidate(args.dest, args.username, cfg);

  const watch = raceWatching();
  console.log(`user ${args.username} dest ${args.dest} host ${cfg.base}`);
  console.log(`state phase=${watch.phase || "?"} run=${watch.run || "?"} watching=${watch.watching}`);
  if (args.write && watch.watching) {
    die(
      `--write refused: ${watch.phase} (${watch.run || "no run id"}). ` +
        `Wait until cycle-15 is called (keep/revert), then write before cycle-16 seed.`,
    );
  }

  const asgn = loadAssignments();
  if (asgn.setHash && asgn.setHash !== "1f90aub") {
    console.warn(`WARNING benchmarks setHash ${asgn.setHash} (expected 1f90aub)`);
  }

  const plans = JSON.parse(fs.readFileSync(args.plans, "utf8"));
  const list = Array.isArray(plans) ? plans : plans.plans || [];
  const byRoom = new Map(list.map((p) => [p.room, p]));
  const missing = BENCH.filter((r) => !(byRoom.get(r) && byRoom.get(r).structures && byRoom.get(r).structures.spawn));
  if (missing.length) die("not in plans-hub: " + missing.join(","));

  const now = Date.now();
  const segData = {};
  const targets = [];
  const rows = [];

  for (let i = 0; i < BENCH.length; i++) {
    const room = BENCH[i];
    const plan = byRoom.get(room);
    const seg = SEG_PLANS[Math.floor(i / PER)];
    if (FORBIDDEN_SEGS.has(seg) || seg < 80 || seg > 86) die("refusing segment " + seg);
    const roadStage = roadStageFor(plan);
    const sc = planScore(plan);
    const hash = planHash(plan.structures);
    const spawn = plan.structures.spawn[0];
    const payload = {
      room,
      structures: plan.structures,
      sitter: plan.sitter,
      labInputs: plan.labInputs,
      shellCut: (plan.meta && plan.meta.shell && plan.meta.shell.cut) || [],
      roadStage,
      planHash: hash,
      pushedAt: now,
    };
    (segData[seg] ||= {})[room] = payload;
    targets.push({ room, score: sc.s, spawnPos: spawn, hash, seg });
    rows.push({
      room,
      seg,
      hash,
      score: sc.s,
      cut: sc.cut,
      eco: sc.eco,
      hardness: asgn.hardness[room],
      spawn,
      own: ownLabel(room, asgn),
      arterial: roadStage.filter((s) => s <= ARTERIAL_RCL).length,
      roads: roadStage.length,
    });
    for (const lvl of AUDIT_RCLS) {
      const orphans = stagedOrphans(plan, roadStage, lvl);
      if (orphans.length)
        console.warn(
          `WARNING ${room}: ${orphans.length} staged RCL${lvl} road tiles are not connected to ` +
            `the hub — ${orphans.map((t) => `${t.x},${t.y}`).join(" ")}`,
        );
      const stranded = unreachableTerminals(plan, roadStage, lvl);
      if (stranded.length)
        console.warn(
          `WARNING ${room}: ${stranded.length} eco terminals a creep cannot reach at RCL${lvl} — ` +
            stranded.map((c) => `${c.x},${c.y}`).join(" "),
        );
    }
  }

  const indexPayload = { targets, owner: CANDIDATE_USER, pushedAt: now, bench: true };

  console.log("room     pack  score   hard    eco  cut  hash     spawn   own-when");
  for (const r of rows) {
    const hard = r.hardness == null ? "    ?" : r.hardness.toFixed(3).padStart(7);
    console.log(
      `${r.room.padEnd(7)}  ${String(r.seg).padStart(4)}  ${String(r.score).padStart(6)} ${hard}  ` +
        `${String(r.eco).padStart(3)}  ${String(r.cut).padStart(3)}  ${r.hash.padEnd(7)}  ` +
        `${String(r.spawn.x).padStart(2)},${String(r.spawn.y).padStart(2)}  ${r.own}`,
    );
  }
  console.log(
    `pack ${rows.length}/16  segs ` +
      Object.entries(segData)
        .map(([s, m]) => `${s}:${Object.keys(m).join("+")} ${JSON.stringify(m).length}B`)
        .join(" · ") +
      ` · 86 ${JSON.stringify(indexPayload).length}B`,
  );
  console.log(
    `cand-default (no --swap): ${[...asgn.defaultCand].join(" ")}`,
  );
  console.log(
    `cand-swap    (--swap)   : ${[...asgn.defaultCtrl].join(" ")}`,
  );
  console.log("control never written. planner 88/98 never written.");

  for (const [seg, map] of Object.entries(segData)) {
    const n = Number(seg);
    if (FORBIDDEN_SEGS.has(n)) die("internal: forbidden segment " + n);
    const data = JSON.stringify(map);
    if (data.length > 100 * 1024) die(`segment ${seg} too big: ${data.length}`);
  }

  let live = false;
  try {
    const { token, userId } = tokenForUser(args.username);
    cfg.token = token;
    live = true;
    console.log(`token ok userId=${userId}`);
  } catch (e) {
    if (args.write) die("token: " + e.message);
    console.warn("token skipped: " + e.message);
  }

  if (live) {
    try {
      const ctrlCfg = loadConfig(CONTROL_DEST);
      const ctrl86 = await peekSegment(ctrlCfg, SEG_INDEX);
      console.log("CTRL 86: " + summarizeIndex(ctrl86));
      if (ctrl86.bench || ctrl86.owner === CANDIDATE_USER) {
        const msg = "control segment 86 already looks like a bench pack — A/B is contaminated; do not --write";
        if (args.write) die(msg);
        console.warn("WARNING " + msg);
      }
    } catch (e) {
      console.warn("CTRL 86 peek failed: " + e.message);
    }
    try {
      const cand86 = await peekSegment(cfg, SEG_INDEX);
      console.log("CAND 86 now: " + summarizeIndex(cand86));
    } catch (e) {
      console.warn("CAND 86 peek failed: " + e.message);
    }
  }

  if (!args.write) {
    console.log("dry run — not written");
    return;
  }

  console.log("writing candidate 80-86 + autoExpand=false");
  for (const [seg, map] of Object.entries(segData)) {
    const n = Number(seg);
    if (FORBIDDEN_SEGS.has(n) || n < 80 || n > 85) die("refusing write segment " + n);
    const data = JSON.stringify(map);
    await api(cfg, "POST", "/api/user/memory-segment", { segment: n, data });
    console.log(`  ${n} <- ${Object.keys(map).join(", ")} (${data.length}B)`);
  }
  await api(cfg, "POST", "/api/user/memory-segment", {
    segment: SEG_INDEX,
    data: JSON.stringify(indexPayload),
  });
  const back = await peekSegment(cfg, SEG_INDEX);
  if (!back.bench || !back.targets || back.targets.length !== 16) die("segment 86 verify failed: " + summarizeIndex(back));
  if (back.owner !== CANDIDATE_USER) die("owner is not " + CANDIDATE_USER);
  console.log("  86 <- 16 targets bench=true owner=pacifist");

  await api(cfg, "POST", "/api/user/console", {
    expression:
      "Memory.features=Memory.features||{};Memory.features.autoExpand=false;" +
      "delete Memory.packAdopt;delete Memory.planV2Adopt;" +
      "if(Memory.planAnim)Memory.planAnim.active=false;" +
      "'ok autoExpand=false packAdopt/planV2Adopt cleared planAnim off'",
  });
  console.log("  console: autoExpand=false");

  try {
    const ctrl86 = await peekSegment(loadConfig(CONTROL_DEST), SEG_INDEX);
    console.log("CTRL 86 after: " + summarizeIndex(ctrl86));
    if (ctrl86.bench || (ctrl86.targets && ctrl86.targets.length === 16 && ctrl86.owner === CANDIDATE_USER)) {
      die("control 86 changed — abort and inspect; this script must never write control");
    }
  } catch (e) {
    console.warn("CTRL 86 post-check failed: " + e.message);
  }

  console.log("ok — candidate 80-86 hold the 16-room bench pack");
}

main().catch((e) => {
  console.error(e && e.message ? e.message : e);
  process.exit(1);
});
