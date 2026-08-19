# Next — adopt the 16-room v2 pack (candidate only)

Read-only rec. No src. **Do not run any push now.** Do not `push-race`. Do not
`server:local:reset`. Do not `plan.mjs` (rewrites `plans-hub.json`).

One knob. Metric: mean ticks spawn→RCL4. Set `1f90aub`. `--swap` mandatory.

---

## Why this is a knob

Race rooms have **`planPackMiss` + `basePlan`**. `construction()` never hits
`placeFromPlanV2`. So:

| live on race rooms | why inert |
| --- | --- |
| **First-box** (`_next-boxes.md` #1) | needs `plan.t.container` / `si`. Object-order `[0]` vs min-chebyshev never runs. |
| **planV2 leftover-5** | `extensionTake` is already on BasePlan + checkerboard. The planV2 placer is not. |

`tools/plan-suite/out-v2/plans-hub.json` already has all 16. Segments do not.

This race is **segments only**. Same KEEP stack as control-vs-candidate today:
**leftover-5 + 6W-after-550 + no-rcl2-boxes** (cycles 5 / 4 / 10). Do not
bundle first-box, 5W latch, haul-2, recycle, HOL.

Control stays frozen `e839fc8` on `pacifist-race`. **Never write its segments.**

---

## Never

```
npm run push-race
--dest race
--user pacifist-race
npm run push-vps / push-main
server:local:reset
plan.mjs --all-claimable
mid-race push-pacifist
```

`--dest pserver` token is already `pacifist`. Still pass `--user pacifist`.
`--user pacifist-race` on dest `pserver` is the footgun — that is control.

Wait until the live cycle is called. Do not adopt onto a running seed.

---

## What adopting actually changes (still one knob)

`room.memory.planV2` → `construction()` returns into `placeFromPlanV2`. Legacy
BasePlan / checkerboard / `siteLegacyControllerDepot` / RCL3 source-box gate
do not run.

Same policy functions, different tiles:

| KEEP | still holds? | note |
| --- | --- | --- |
| leftover-5 | yes | shared `extensionTake` (5 through RCL3) |
| 6W after 550 | yes | spawn, not construction |
| no-rcl2-boxes | **no on the plan path** | live gate is `rooms.construction.ts` `level >= 3`. PlanV2 `plannedTilesFor` still sites `container[0]` at RCL2 |
| no BasePlan RCL3 roads | **no on the plan path** | `roadsForRcl` still returns eco+tower arterials at 3 (builders suicide; 4 dead slots) |

First-box tile is **still** object-order `[0]`. Adopting the pack does not
implement min-chebyshev. Do not “fix” that in this race.

Young rooms (`RCL<4` and `<15` my structs) **auto-arm** `planMigration: auto`.
That is correct on a clean seed. Fatal if leftover RCL8 structures/memory
survive (next section).

---

## Risks

### 1. Leftover RCL8 plan (the E4S7 bug)

`runPackAdoption` **skips any room that already has `planV2`**. A stale RCL8
layout then runs the whole clock.

Lived: E4S7 `planV2` + `rclTimes.8: 3121322` + `startTick` **before** seed.
`race.mjs --wipe` does **not** clear `Memory.rooms`. Candidate also owns eight
RCL8 empire rooms (67 Redis room keys). `_NEXT-RACE.md` §0.

Must be true before the clock starts:

- bench rooms empty (source / mineral / controller only)
- no `Memory.rooms[r].planV2` on either racer
- no `rclTimes.8` / old `startTick` (`resetSpeedrun()`)
- no `planPackMiss` (else 3000t backoff)

### 2. Adopt timeout

Two clocks, both leave the room on BasePlan:

| path | timeout | then |
| --- | ---: | --- |
| `adoptPlan` / `runPlanV2Adoption` (seg **88**) | **20** ticks | drop `Memory.planV2Adopt`; log `segment 88 empty?` |
| `runPackAdoption` (seg **80–86**) | **200** ticks | `planPackMiss = Game.time`; retry in **3000** t |

`Memory.planV2Adopt` is **one room**. A 16-way `--adopt` loop without waiting
keeps only the last name.

`setActiveSegments` replaces the set. Keep `Memory.planAnim` off. Error
segment + animator + 88 + 80–86 fight the 10-slot cap and starve the pack
read → 200t timeout → miss.

If a room is already `planPackMiss` from the empty-pack scan, **delete it**
or wait 3000t. Pack write after seed without a memory scrub is this failure.

### 3. AutoExpand claiming a bench room

`push-expansion-pack.mjs` writes **expansion ranking** to 86 (top 12, dist
2–5 of *owned* rooms, skips taken). That is **not** the 16-room bench pack.

A bench index in 86 + `features.autoExpand !== false` + unowned bench rooms
= candidate colonises a pair room. Set `Memory.features.autoExpand = false`
on candidate **before** any pack write. `runPackAdoption` still runs.

### 4. Control contamination

Segments are per-user. Writing 80–86 / 88 as `pacifist-race` gives control
planV2. Then it is not leftover-5+6W+no-rcl2-boxes **BasePlan**.

---

## 16 rooms (`1f90aub`)

All present in `tools/plan-suite/out-v2/plans-hub.json` (do not rewrite).

```
E5S3 E9S1 E12S3 E13S9 E18S9 E8S5 E11S6 E8S3
E16S9 E4S7 E18S5 E6S1 E12S1 E3S5 E13S7 E21S4
```

| | candidate owns (adopt these) | control owns (do not touch) |
| --- | --- | --- |
| default | E9S1 E13S9 E8S5 E8S3 E4S7 E6S1 E3S5 E21S4 | E5S3 E12S3 E18S9 E11S6 E16S9 E18S5 E12S1 E13S7 |
| `--swap` | the other eight | the first eight |

Put **all 16** in **candidate** segments so a later `--swap` seed still
adopts. Control segments stay empty.

---

## 0. Hygiene (both racers, before pack)

pacifist2 / waxeye offline. Empire parked. Bench objects + memory gone.

```powershell
# extra bots off
Get-Content tools/server/_pause-extra-bots.js -Raw |
  docker exec -i local-screeps-server-mongo-1 mongosh screeps --quiet

# park RCL6+ empire (skips bench names)
Get-Content tools/server/_park-empire.js -Raw |
  docker exec -i local-screeps-server-mongo-1 mongosh screeps --quiet

# user-null leftovers (wipe misses these — depot ghosts at E5S3 40,42 / E12S3 18,30)
Get-Content tools/server/_scrub-bench-objects.js -Raw |
  docker exec -i local-screeps-server-mongo-1 mongosh screeps --quiet

# room memory + speedrun clocks on BOTH racers (not segments)
fnm exec --using 22 node tools/server/_scrub-racer-mem.mjs
```

Preflight only (writes nothing):

```powershell
fnm exec --using 22 node tools/server/race.mjs --seed --wipe --yes --dry-run
```

16/16 OK, zero preflight problems, then continue.

---

## 1. Confirm hub, dest, user

```powershell
fnm exec --using 22 node --input-type=module -e "import fs from 'fs'; const p=JSON.parse(fs.readFileSync('tools/plan-suite/out-v2/plans-hub.json','utf8')); const n='E5S3,E9S1,E12S3,E13S9,E18S9,E8S5,E11S6,E8S3,E16S9,E4S7,E18S5,E6S1,E12S1,E3S5,E13S7,E21S4'.split(','); const have=new Set(p.map(x=>x.room)); const miss=n.filter(r=>!have.has(r)); console.log(miss.length?('MISSING '+miss.join(',')):'16/16 in plans-hub');"

fnm exec --using 22 node tools/server/push-plan.mjs E5S3 --dest pserver --user pacifist --dry-run
```

`--dry-run` must say `E5S3` and **not written**. Abort if it prints
`pacifist-race` / dest `race`.

Stock expansion pack — **do not use for this A/B**:

```powershell
# WRONG pack (top 12 claimable, not the 16 bench rooms)
# fnm exec --using 22 node tools/server/push-expansion-pack.mjs --user pacifist --dest pserver
```

---

## 2. Push the 16-room pack → candidate 80–86 only

Same payload shape as `push-expansion-pack.mjs` (so `runPackAdoption` +
`packPlanPayload` accept it). 3 rooms / segment, 80–85. Index on 86 with
`bench: true`. Imports `roadStageFor` from `push-plan.mjs`.

Candidate console **first** (not control):

```
Memory.features.autoExpand = false
delete Memory.packAdopt
delete Memory.planV2Adopt
if (Memory.planAnim) Memory.planAnim.active = false
```

Then write the pack. `--dry-run` first.

```powershell
$js = Join-Path $env:TEMP "push-bench-pack.mjs"
[System.IO.File]::WriteAllText($js, @'
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { pathToFileURL } from "url";

const REPO = process.cwd();
const BENCH = [
  "E5S3","E9S1","E12S3","E13S9","E18S9","E8S5","E11S6","E8S3",
  "E16S9","E4S7","E18S5","E6S1","E12S1","E3S5","E13S7","E21S4",
];
const SEG_PLANS = [80, 81, 82, 83, 84, 85];
const PER = 3;
const dry = process.argv.includes("--dry-run");
const dest = "pserver";
const username = "pacifist";
if (username === "pacifist-race" || dest === "race") throw new Error("refusing control");

const raw = JSON.parse(fs.readFileSync(path.join(REPO, "screeps.json"), "utf8"))[dest];
if (!raw) throw new Error("no dest " + dest);
const base = `${raw.protocol || "http"}://${raw.hostname}${raw.port ? ":" + raw.port : ""}${raw.path || "/"}`.replace(/\/+$/, "");

function mongoEval(js) {
  return execFileSync("docker", ["exec", "local-screeps-server-mongo-1", "mongosh", "--quiet", "--eval", js], { encoding: "utf8" }).trim();
}
function redis(a) {
  return execFileSync("docker", ["exec", "local-screeps-server-redis-1", "redis-cli", ...a], { encoding: "utf8" }).trim();
}
function tokenForUser(name) {
  if (name === "pacifist-race") throw new Error("refusing control user");
  const userId = mongoEval(`db = db.getSiblingDB("screeps"); var u = db.users.findOne({username: ${JSON.stringify(name)}}); print(u ? String(u._id) : "")`);
  if (!userId || userId === "pacifist-race") throw new Error("refusing control / missing user");
  for (const key of redis(["keys", "auth_*"]).split("\n").filter(Boolean)) {
    if (redis(["get", key]) === userId) return key.slice("auth_".length);
  }
  throw new Error("no redis token for " + name);
}

function planHash(structures) {
  const s = JSON.stringify(structures);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

const token = tokenForUser(username);
async function api(method, endpoint, body) {
  const res = await fetch(base + endpoint, {
    method,
    headers: { "Content-Type": "application/json", "X-Token": token, "X-Username": token },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok !== 1) throw new Error(`${method} ${endpoint}: ${res.status} ${JSON.stringify(json).slice(0, 200)}`);
  return json;
}

const { roadStageFor } = await import(pathToFileURL(path.join(REPO, "tools", "server", "push-plan.mjs")).href);
const plans = JSON.parse(fs.readFileSync(path.join(REPO, "tools", "plan-suite", "out-v2", "plans-hub.json"), "utf8"));
const byRoom = new Map(plans.map((p) => [p.room, p]));
const missing = BENCH.filter((r) => !(byRoom.get(r) && byRoom.get(r).structures));
if (missing.length) throw new Error("not in plans-hub: " + missing.join(","));

const now = Date.now();
const segData = {};
const targets = [];
for (let i = 0; i < BENCH.length; i++) {
  const room = BENCH[i];
  const plan = byRoom.get(room);
  const seg = SEG_PLANS[Math.floor(i / PER)];
  const roadStage = roadStageFor(plan);
  const payload = {
    room,
    structures: plan.structures,
    sitter: plan.sitter,
    labInputs: plan.labInputs,
    shellCut: (plan.meta && plan.meta.shell && plan.meta.shell.cut) || [],
    roadStage,
    planHash: planHash(plan.structures),
    pushedAt: now,
  };
  (segData[seg] ||= {})[room] = payload;
  targets.push({ room, score: 0, spawnPos: plan.structures.spawn[0], hash: payload.planHash, seg });
}
const indexPayload = { targets, owner: username, pushedAt: now, bench: true };

console.log("user", username, "dest", dest, "host", base);
for (const [seg, map] of Object.entries(segData)) {
  const data = JSON.stringify(map);
  if (data.length > 100 * 1024) throw new Error("segment " + seg + " too big: " + data.length);
  console.log(" ", seg, Object.keys(map).join(","), data.length + "B");
}
console.log("  86", targets.length, "targets", JSON.stringify(indexPayload).length + "B");
if (dry) { console.log("dry run — not written"); process.exit(0); }

for (const [seg, map] of Object.entries(segData)) {
  await api("POST", "/api/user/memory-segment", { segment: Number(seg), data: JSON.stringify(map) });
}
await api("POST", "/api/user/memory-segment", { segment: 86, data: JSON.stringify(indexPayload) });
const back = await api("GET", "/api/user/memory-segment?segment=86");
const verify = JSON.parse(back.data || "{}");
if (!verify.bench || !verify.targets || verify.targets.length !== 16) throw new Error("segment 86 verify failed");
if (verify.owner !== "pacifist") throw new Error("owner is not pacifist");
console.log("ok — candidate 80-86 hold the 16-room bench pack");
'@)

# from repo root
fnm exec --using 22 node $js --dry-run
# only if dry-run lists all 16 and dest pserver / user pacifist:
# fnm exec --using 22 node $js
```

Do **not** run the second line until the race is ready to seed.

### Prove control is untouched

```powershell
$cand = @{ "X-Token" = "local-pacifist-user-token-001"; "X-Username" = "local-pacifist-user-token-001" }
$ctrl = @{ "X-Token" = "local-pacifist-race-token-001"; "X-Username" = "local-pacifist-race-token-001" }
"CAND 86: " + (Invoke-RestMethod "http://127.0.0.1:23456/api/user/memory-segment?segment=86" -Headers $cand).data.Substring(0, [Math]::Min(180, 999))
"CTRL 86: " + ((Invoke-RestMethod "http://127.0.0.1:23456/api/user/memory-segment?segment=86" -Headers $ctrl).data)
```

Candidate data must contain `"bench":true` and 16 names. Control must **not**.

---

## 3. Seed, then let pack adoption run

```powershell
fnm exec --using 22 node tools/server/race.mjs --seed --wipe --yes --swap `
  --label "cycle-N-adopt-plans" `
  --note "candidate v2 pack vs leftover-5+6W+no-rcl2-boxes BasePlan" `
  --target-rcl 4 --tick-budget 40000
```

Alternate `--swap` across runs of the cycle. Same pack either orientation.

**Candidate console only** (not `pacifist-race`), immediately after seed:

```
Memory.features.autoExpand = false
delete Memory.packAdopt
delete Memory.planV2Adopt
const R=["E5S3","E9S1","E12S3","E13S9","E18S9","E8S5","E11S6","E8S3","E16S9","E4S7","E18S5","E6S1","E12S1","E3S5","E13S7","E21S4"]
for (const r of R) {
  if (Memory.rooms[r]) {
    delete Memory.rooms[r].planV2
    delete Memory.rooms[r].planPackMiss
    delete Memory.rooms[r].planMigration
    delete Memory.rooms[r].basePlan
  }
}
resetSpeedrun()
```

Prefer deleting the whole `Memory.rooms[r]` (what `_scrub-racer-mem.mjs`
does) if you re-scrub after seed. Then `resetSpeedrun()`.

`runPackAdoption` scans every **25** t, one room at a time, 80–86. Budget
**200** t per room. Eight owned candidate rooms: expect plans inside ~1–2k
ticks if segments stay active. `autoExpandStatus()` prints `unplanned […]`
and `packAdopt`.

Fail if any candidate room still has `planPackMiss` and no `planV2` after
200 t — delete the miss and `Memory.packAdopt`, confirm 80–86 still read
back, do not start the clock comparison until 8/8 adopted.

---

## 4. Fallback — `push-plan` + `adoptPlan` (8 owned rooms)

If the pack path wedges: segment **88**, one room, wait for `planV2` before
the next. After seed. Candidate user only. Swap list from the table above.

```powershell
# default candidate rooms (no --swap). Wait: adopt timeout is 20 ticks.
$rooms = @("E9S1","E13S9","E8S5","E8S3","E4S7","E6S1","E3S5","E21S4")
foreach ($r in $rooms) {
  fnm exec --using 22 node tools/server/push-plan.mjs $r --dest pserver --user pacifist --adopt
  Start-Sleep -Seconds 3
}
```

`--adopt` POSTs `adoptPlan("<room>")` to **that user's** console. Room must
be visible and **owned** or adoption logs `not visible/owned` and dies.

Do not `--adopt` all 16 in one blast. Do not `--adopt` control's eight.

Without `--adopt`, same push then in the **pacifist** console:
`adoptPlan("E9S1")` — still one at a time, still ≤20 t.

---

## 5. Gate before `--watch`

Candidate (8 owned bench rooms):

```
autoExpandStatus()
migrateStatus()
```

Need: `planV2` present, `planPackMiss` absent, `rclTimes` has no `8`,
`features.autoExpand` false, `arm:auto` (young) or placement-only.

Control: `planV2` absent, BasePlan path, leftover-5 still 5 ext at L3.

Then:

```powershell
fnm exec --using 22 node tools/server/race.mjs --watch --run <runId> --interval 15
```

Dash: `http://127.0.0.1:8767/` (`node tools/server/race-dash.mjs --watch 45 --serve 8767`).

---

## Verdict rule

Same as every other cycle. N≥3 per orientation, `--swap` balanced, 8/8
RCL4 (or say the censor). Do not keep “plans” off a 7/8 or a room that
adopted late / ran BasePlan for the slam.

If candidate never adopts (all `planPackMiss`), this run is not the knob —
it is the current baseline again.
