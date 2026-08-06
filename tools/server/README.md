# Local private-server tooling

Everything here talks to the **local disposable test server** (docker compose):

| container | role |
| --- | --- |
| `local-screeps-server-screeps-1` | game server (host `127.0.0.1:23456` → container `21025`) |
| `local-screeps-server-mongo-1` | mongo, db `screeps` |
| `local-screeps-server-redis-1` | redis |

> **Port moved 23025 → 23456** (2026-08): Windows reserved the 23025 range (`netsh int ipv4 show excludedportrange protocol=tcp`), so docker compose remaps the host side. If pushes/API calls start failing with `ECONNREFUSED`, confirm the current host port with `docker ps --format "{{.Names}}\t{{.Ports}}"` — the `local-screeps-server-screeps-1` row shows `127.0.0.1:<host>->21025/tcp` — then update `screeps.json` dests and `SCREEPS_API`.

Mods: `screepsmod-mongo`, `screepsmod-auth`, `screepsmod-admin-utils`, `screepsmod-map-tool`, `screepsmod-history`.

---

## Deploy targets

The scripts in this folder only ever touch the **local** server, but the repo pushes code to
three different servers. Every `npm run push-*` is `rollup -c --environment DEST:<dest>` and
reads the matching entry from the gitignored `screeps.json`.

| Target | `screeps.json` dest | Server | Command | Who owns it |
| --- | --- | --- | --- | --- |
| **local** | `pacifist` / `pserver` / `pacifist2` / `waxeye` / `race` | `http://127.0.0.1:23456` (docker compose, this machine) | `npm run push-pacifist` | this repo — disposable, reset freely |
| **vps** | `vps` (fallback `vps-ip`) | `http://screeps.marlyman123.com`, fallback `http://100.67.41.31:21025` | `npm run push-vps` / `npm run push-vps-ip` | the `big_vps` repo — **hands off** |
| **live** | `main` | `https://screeps.com` (official MMO) | `npm run push-main` | the owner — never push unattended |

### VPS test server

* Screeps **v4.3.0**, tick duration **300 ms** (set via `system.setTickDuration(300)` on that
  box, persisted in its `db.json`) — much faster than the 1 s local server, so ~3x more ticks
  per wall-clock minute for long-horizon tests.
* **Tailnet-only.** It is reachable exclusively over the owner's Tailscale tailnet
  (`http://screeps.marlyman123.com`, fallback `http://100.67.41.31:21025`); the public IP
  refuses `:21025` and firewalld only allows 80/443 (SSH is tailnet-only too, since the
  2026-08-02 lockdown). Nothing here works off the tailnet.
* **Managed by a separate Claude via the `big_vps` repo**
  (`C:/Users/stemm/Documents/GitHub/big_vps`, see `logs/2026-08-01-screeps.md` there).
  From this repo: **do not SSH to the box, do not run its CLI, do not change mods, systemd
  units, tick rate or world state.** The only allowed interaction is uploading code with
  `npm run push-vps`. Server-side changes go through the big_vps Claude.
* **`screeps.marlyman123.com` now works** (verified 2026-08-05): DNS resolves to the tailnet
  IP `100.67.41.31`, and nginx proxies the vhost to the browser client, which forwards
  `/api`, `/socket` and `/room-history` to the backend. Both `push-vps` and `push-vps-ip`
  are viable; prefer `push-vps`.
* **The read API is live and same-origin** — `GET /api/version` and
  `/api/game/room-terrain?room=W1N1&encoded=1` return data with no auth. Room *contents*
  (`/api/game/room-objects`, `/api/game/room-overview`, `/api/user/memory`) need an
  `X-Token` header.
* **Token is pending.** `screeps.json` carries `PASTE-VPS-TOKEN-HERE` in both the `vps` and
  `vps-ip` entries; the owner replaces it with the output of `auth.createAuthToken('pacifist')`
  run in that server's CLI. Until then `push-vps` and the authenticated reads 401.
* This bot already owns **W1N1** on that server (~53 CPU/tick as of 2026-08-05); `market`
  owns W2N2 and W1N3.
* None of the tooling in this folder (`live-view.mjs`, `race.mjs`, `spawn-in.mjs`,
  `push-*.mjs`) targets the VPS — they all hardcode the local docker/mongo/redis stack.

---

## 0. Accounts, tokens and push targets

| user | `_id` in `db.users` | API token (redis `auth_<token>`) | `screeps.json` dest | npm script |
| --- | --- | --- | --- | --- |
| `pacifist` | `pacifist1` | `local-pacifist-user-token-001` | `pacifist`, `pserver` | `npm run push-pacifist` |
| `pacifist2` | `pacifist2` | `local-pacifist2-user-token-001` | `pacifist2` | `npm run push-pacifist2` |
| `waxeye` | `waxeye1` | `local-waxeye-token-001` | `waxeye` | `npm run push-waxeye` |
| `pacifist-race` | `pacifist-race` | `local-pacifist-race-token-001` | `race` | `npm run push-race` |

`pacifist` and `pacifist2` are two instances of **this** bot (same `src/`), which is what
makes an A/B run possible; `waxeye` is a third account that also runs this repo from its
own dest, so a different branch/build can be parked there.

`pacifist-race` is the **speedrun campaign's control account** (`race.mjs --seed` seeds it as
the control side). It carries a FROZEN build that must not drift — never `npm run push-race`
as part of ordinary work. See `docs/speedrun-ledger/CONTROL.md` for the pinned commit and the
re-baseline procedure.

### Adding a user (the `pacifist-race` recipe, reusable)

`screeps.json` is gitignored, so a new dest is added by hand — the local tokens are fixed
strings, not secrets (see the root `README.md` for the full local block):

```jsonc
"race": { "token": "local-pacifist-race-token-001", "protocol": "http",
          "hostname": "127.0.0.1", "port": 23456, "path": "/", "branch": "main" }
```

```bash
# 1. user document (gcl matched to the other bot accounts so nothing is handicapped)
docker exec local-screeps-server-mongo-1 mongosh screeps --quiet --eval '
db.users.insertOne({_id:"pacifist-race", username:"pacifist-race", usernameLower:"pacifist-race",
  email:"pacifist-race@local.test", cpu:100, cpuAvailable:10000, registeredDate:new Date(),
  money:0, gcl:17000000, credits:0, power:0, active:10000, blocked:false, rooms:[], activeSegments:[],
  authTouched:true, badge:{type:2,color1:"#ff8800",color2:"#ffffff",color3:"#663300",param:0,flip:false}});
db["users.tokens"].insertOne({token:"local-pacifist-race-token-001", user:"pacifist-race", full:true});'

# 2. auth (this server authenticates from redis only)
docker exec local-screeps-server-redis-1 redis-cli set auth_local-pacifist-race-token-001 pacifist-race

# 3. push code, then activate the branch (a first push does NOT set activeWorld)
npm run push-race
docker exec local-screeps-server-mongo-1 mongosh screeps --quiet --eval '
db["users.code"].updateMany({user:"pacifist-race",branch:"main"},{$set:{activeWorld:true,activeSim:true}})'
```

`spawn-in.mjs` auto-detects the bot account with `/^pacifist$/i` first, so `pacifist-race`
is never picked by accident; `race.mjs` always passes `--user` explicitly anyway.

Auth on this server is redis-only: `redis-cli set auth_<token> <userId>`. `db.users.tokens`
carries the same mapping for the web UI. `tools/server/push-expansion-pack.mjs --user <name>`
looks the token up in redis and mints a permanent one if the user has none.

A `rollup -c --environment DEST:<x>` push writes `users.code` but does **not** set
`activeWorld` on a brand-new account — after the first push of a fresh user run:

```bash
docker exec local-screeps-server-mongo-1 mongosh screeps --quiet --eval '
db["users.code"].updateMany({branch:"main"},{$set:{activeWorld:true,activeSim:true}})'
```

---

## 1. Getting a server CLI

`docker exec ... screeps-launcher cli` **only works interactively** — it uses a TTY prompt
library and panics (`panic: no such device or address`) when stdin is a pipe, so it cannot be
scripted.

The CLI is also exposed over HTTP inside the container on `127.0.0.1:21026`:

* `POST /cli` — body is raw JS, response is the (awaited) result
* `GET /greeting` — banner

Port 21026 is bound to container-localhost, so requests must originate inside the container.
A tiny helper is enough:

```bash
# one-time: copy the helper into the container
cat > /tmp/cliexec.js <<'EOF'
const http = require('http');
const body = process.env.CMD || '1+1';
const req = http.request({host:'127.0.0.1',port:21026,method:'POST',path:'/cli',timeout:600000,
  headers:{'Content-Type':'text/plain','Content-Length':Buffer.byteLength(body)}},
  r => { let d=''; r.setEncoding('utf8'); r.on('data',c=>d+=c); r.on('end',()=>{process.stdout.write(d);process.exit(0);}); });
req.on('error', e => { console.error('ERR '+e.message); process.exit(1); });
req.write(body); req.end();
EOF
docker cp /tmp/cliexec.js local-screeps-server-screeps-1:/tmp/cliexec.js

# run any CLI expression (node is NOT on PATH for `docker exec`, use the full path)
MSYS_NO_PATHCONV=1 docker exec -e CMD='Object.keys(map)' \
  local-screeps-server-screeps-1 /screeps/deps/node/bin/node /tmp/cliexec.js
```

Notes:
* node lives at `/screeps/deps/node/bin/node` (not on `$PATH` for `docker exec`).
* On Git Bash prefix with `MSYS_NO_PATHCONV=1`, otherwise `/screeps/...` is mangled into a
  Windows path.
* Everything in the CLI sandbox is available: `map.*`, `system.*`, `bots.*`, `strongholds.*`,
  `storage.db`, plus admin-utils' `utils.*` (`utils.getTickRate()`, `utils.setTickRate(n)`, …).

## 2. Listing rooms

```bash
# every room + status
docker exec local-screeps-server-mongo-1 mongosh screeps --quiet --eval '
const st={}; db.rooms.find().forEach(d=>{(st[d.status]=st[d.status]||[]).push(d._id)});
for(const k in st) print(k+" ("+st[k].length+"): "+st[k].sort().join(","))'

# claimable rooms (controller + >=2 sources) and who owns what
docker exec local-screeps-server-mongo-1 mongosh screeps --quiet --eval '
db["rooms.objects"].find({type:"controller",user:{$ne:null}},{room:1,user:1,level:1}).forEach(c=>printjson(c))'
```

World layout of this server: playable grid **E0S0 – E21S10** (a solid 22 × 11 rectangle,
242 rooms) plus the one-off `W0S5` — 243 normal rooms — wrapped in a ring of 70
`status: "out of borders"` all-wall rooms (`W0*`, `W1S5`, `*N0`, `*S11`, `E22*`). Every
playable room chains exits to its neighbours; every boundary edge is sealed against the ring.

`bus: true` marks highway rooms — the rule is `roomX % 10 == 0 || roomY % 10 == 0`, i.e.
`E0*`, `E10*`, `E20*`, `*S0`, `*S10` (71 rooms). Highways carry **no sources, no controller
and no mineral**. The other **172 rooms all carry 2 sources + controller + mineral**
(`bus: false`) — that is the planner's test surface and the number `plan.mjs --all-claimable`
should report.

Those 172 rooms are also what the two committed planner gates run against, both of which read
terrain and room objects straight out of this mongo:

```bash
fnm exec --using 22 node tools/plan-suite/v2/validate.mjs   # every shipped plan must pass
fnm exec --using 22 node tools/plan-suite/v2/mutate.mjs     # the validator must BITE (~4s)
```

`mutate.mjs` breaks a shipped plan on purpose, one defect class at a time, and requires the
validator to fail with the expected message — a clean 172/172 baseline plus every mutation
caught. Both honour `PLANS_FILE=<path>` to run against a candidate artifact, and neither ever
writes `out-v2/plans-hub.json`. `mutate.mjs` exits 1 on a gate failure and 2 if the mongo dump
comes back short (a partial dump is an infrastructure fault, not a verdict).

Sector spread (a sector is 10 × 10): `E0S0` 100 · `E1S0` 100 · `E2S0` 20 · `E0S1` 10 ·
`E1S1` 10 · `E2S1` 2 · `W0S0` 1.

## 3. Generating rooms

`map.generateRoom(roomName, opts)`:

| opt | meaning |
| --- | --- |
| `sources` | number of sources (default random 1–2) — **pass 2** |
| `terrainType` | 1–28 landscape preset (fill/smoothing) |
| `swampType` | 0–14 swamp preset (0 = no swamp) |
| `mineral` | `H O Z K U L X` or `false` |
| `controller` | default `true` |
| `keeperLairs` | default `false` |
| `exits` | explicit exit arrays; by default copied from existing neighbours |

`generateRoom` refuses if the room already exists, so replace a border room with
`map.removeRoom(name)` first. Exits are matched against **existing** neighbours: remove every
room you intend to regenerate *before* generating any of them, otherwise a neighbour that is
still an all-wall ring room forces a sealed edge.

```bash
# replace the whole E11 column + W0S5 with real rooms
MSYS_NO_PATHCONV=1 docker exec -e CMD='["E11S0","E11S1","E11S2"].reduce((p,r)=>p.then(()=>map.removeRoom(r)),Promise.resolve()).then(()=>"REMOVED")' \
  local-screeps-server-screeps-1 /screeps/deps/node/bin/node /tmp/cliexec.js

MSYS_NO_PATHCONV=1 docker exec -e CMD='[["E11S0",3,2,"H"],["E11S1",9,4,"O"]].reduce((p,a)=>p.then(()=>map.generateRoom(a[0],{sources:2,terrainType:a[1],swampType:a[2],mineral:a[3]})),Promise.resolve()).then(()=>"OK")' \
  local-screeps-server-screeps-1 /screeps/deps/node/bin/node /tmp/cliexec.js
```

### Growing the world into virgin space (no ring room there yet)

`_matchExitWithNeighbors` copies exits from a neighbour's terrain doc **if that doc exists**,
otherwise it invents a random open exit. So expanding past the current border without
preparation punches open exits into rooms that will never exist. Create the all-wall ring
**first**, then generate inward-facing rooms; every boundary edge is then sealed automatically
and no explicit `opts.exits` is needed:

```bash
# 1. ring: out-of-borders room docs + 2500-char all-wall terrain (mirrors the world generator)
docker exec local-screeps-server-mongo-1 mongosh screeps --quiet --eval '
const WALL="1".repeat(2500);
["E22N0","E22S0"].forEach(id=>{
  db.rooms.insertOne({_id:id,name:id,status:"out of borders",bus:true,openTime:null,
    sourceKeepers:null,novice:null,respawnArea:null,depositType:"silicon"});
  db["rooms.terrain"].insertOne({room:id,terrain:WALL});});'

# 2. give them map tiles, refresh the terrain cache
MSYS_NO_PATHCONV=1 docker exec -e CMD='(async()=>{for(const r of ["E22N0","E22S0"])
  await map.updateRoomImageAssets(r); await map.updateTerrainData(); return "OK";})()' \
  local-screeps-server-screeps-1 /screeps/deps/node/bin/node /tmp/cliexec.js
```

The CLI sandbox runs `async`/`await` and exposes `storage.db`, so a whole column can be
generated (and its failures collected instead of aborting the chain) in a single POST — but
note there is **no `setTimeout`** in the sandbox:

```bash
MSYS_NO_PATHCONV=1 docker exec -e CMD='(async()=>{const out=[];
for(let y=0;y<=10;y++){const n="E12S"+y;
  try{await map.generateRoom(n,{sources:2,terrainType:9,swampType:3,mineral:"H"});out.push(n+":OK");}
  catch(e){out.push(n+":ERR "+(e&&e.message||e));}}
return out.join(" | ");})()' local-screeps-server-screeps-1 /screeps/deps/node/bin/node /tmp/cliexec.js
```

Regenerating a room after its neighbours already exist is safe: `removeRoom` + `generateRoom`
re-copies the exits from all four neighbours, so edge continuity is preserved.

`generateRoom` already calls `map.updateRoomImageAssets()` + `map.updateTerrainData()`, so the
map view and the terrain cache are refreshed. It sometimes drops both sources on the same tile
— **always verify** `sources == 2` and regenerate with another `terrainType` if not:

```bash
docker exec local-screeps-server-mongo-1 mongosh screeps --quiet --eval '
["E11S0","E11S1"].forEach(r=>{const o=db["rooms.objects"].find({room:r}).toArray();
print(r+" sources="+o.filter(x=>x.type=="source").length+" ctrl="+o.filter(x=>x.type=="controller").length+
" mineral="+o.filter(x=>x.type=="mineral").map(x=>x.mineralType));})'
```

`generateRoom` inserts a minimal room doc (`_id`, `status`, `sourceKeepers`). Existing rooms
also carry `name`, `bus`, `openTime`, `novice`, `respawnArea`, `depositType` — worth
back-filling so new rooms look identical to the rest:

```bash
docker exec local-screeps-server-mongo-1 mongosh screeps --quiet --eval '
db.rooms.updateMany({_id:{$in:["E11S0"]}},{$set:{bus:false,openTime:null,novice:null,respawnArea:null,depositType:null}});
db.rooms.updateOne({_id:"E11S0"},{$set:{name:"E11S0"}})'
```

Other useful map commands: `map.openRoom(name)`, `map.closeRoom(name)`,
`map.removeRoom(name)`, `map.updateTerrainData()`.

### Full world reset (rebuild everything from scratch)

Back up first — `resetAllData()` drops every collection **and flushes redis**, so all auth
tokens, memory segments and the game clock go with it:

```bash
docker exec local-screeps-server-mongo-1 sh -c \
  'mongodump --db=screeps --archive=/data/screeps-backup-$(date +%Y%m%d-%H%M%S).gz --gzip'
docker cp local-screeps-server-mongo-1:/data/screeps-backup-<stamp>.gz .
```

Then, in order — every step matters:

1. `system.resetAllData()` — screepsmod-mongo re-imports `db.original.json`, which is **not**
   an empty world: it restores the stock 121-room `W0N0–W10N10` map, four demo bots
   (`MichaelBot`, `EmmaBot`, `AliceBot`, `JackBot`) **and `mainLoopPaused = 1`**.
2. `utils.removeBots()` to drop the demo accounts, then
   `docker restart local-screeps-server-screeps-1`.
3. Wipe the stock map and lay the ring: delete `rooms`, `rooms.terrain`, `rooms.objects`,
   `rooms.flags`, then insert the 70 out-of-borders docs + 2500-char all-wall terrain
   (see §3 "Growing the world into virgin space").
4. Generate the 243 playable rooms **inside the ring**, column by column, west to east and
   north to south, so each room's already-existing neighbours are the ring or an earlier
   room. `W0S5` must be generated *before* `E0S5`. Highways get
   `{sources: 0, controller: false, mineral: false}`, everything else `{sources: 2}`.
   243 rooms take about **35 seconds** at ~11 rooms per CLI POST.
5. Verify `sources == 2` on every non-highway room (the generator drops both sources on one
   tile every ~200 rooms) and regenerate the misses with another `terrainType`.
6. Back-fill `name`, `bus`, `openTime`, `novice`, `respawnArea`, `depositType` — `generateRoom`
   only writes `_id`/`status`/`sourceKeepers`.
7. `docker restart local-screeps-server-screeps-1` (terrain cache).
8. Recreate the users + redis `auth_` tokens (§0), push code, set `activeWorld`.
9. **`system.resumeSimulation()`** — the clock is still paused from step 1. Confirm with
   `curl -s http://127.0.0.1:23456/api/game/time` twice.
10. `system.setTickDuration(50)` if it is not already 50 ms (that is this server's setting;
    `utils.getTickRate()` is deprecated and returns only a warning — use
    `system.getTickDuration().then(d => d)`, since the CLI helper does not await a bare
    string-concatenated promise).

## 4. `spawn-in.mjs` — drop the bot into a room at its planned spawn

```bash
# plan the room first (plan.mjs REWRITES plans-hub.json with only the rooms it planned,
# so prefer --all-claimable unless you are fine losing the other entries)
fnm exec --using 22 node tools/plan-suite/v2/plan.mjs --all-claimable

fnm exec --using 22 node tools/server/spawn-in.mjs E11S5 --dry-run
fnm exec --using 22 node tools/server/spawn-in.mjs E11S5
```

Options: `--user <username>` (default: auto-detect the `pacifist` account; `waxeye` is never
auto-detected but **is** allowed when named explicitly — only the NPC accounts `Invader`,
`Source Keeper` and `Screeps` are refused outright),
`--spawn-index <n>` (which planned spawn, default `0`), `--spawn-name <name>` (default
`Spawn1`), `--downgrade-ticks <n>` (default `200000`), `--dry-run`.

What it does:

1. reads `tools/plan-suite/out-v2/plans-hub.json`, takes `structures.spawn[index]`
   (exits 1 with the `plan.mjs` command to run if the room is missing);
2. picks the bot user from `db.users` (never `waxeye` / `Invader` / `Source Keeper` /
   `Screeps`) and prints which one it chose;
3. **refuses** if: the room does not exist / is not `normal` / is an SK room / has no
   controller / the controller is owned or reserved / *any* object in the room already has a
   `user` / the planned tile is wall or occupied;
4. sets the controller to `level: 1`, `user`, `progress: 0`, `progressTotal: 200`,
   `downgradeTime: <game time> + 200000`, clears `reservation`/`sign`;
5. inserts a `spawn` (`store.energy 300`, `storeCapacityResource.energy 300`,
   `hits/hitsMax 5000`, `spawning: null`, `notifyWhenAttacked: true`, `off: false`);
6. sets `rooms.<room>.active = true`, adds the room to `users.<bot>.rooms` and raises
   `users.<bot>.active` to `10000` so the runner executes the bot's code;
7. verifies via mongo **and** `GET /api/game/room-objects?room=<room>&shard=shard0`.

No server restart or tick pause is needed — the processor picks the room up on the next tick
(a creep normally appears within a few seconds).

### Schema quirks worth knowing

* `rooms.objects._id` are real `ObjectId`s — let mongo generate them (do not hand-write hex
  strings).
* `user` **references are strings**, even when the user document's `_id` is an `ObjectId`
  (e.g. `waxeye`). Always store `String(user._id)`.
* Terrain is a 2500-char string, index `y*50+x`, bitmask `1 = wall`, `2 = swamp`, so a
  swampy wall is `'3'` — treat any char with bit 1 set as wall when comparing exits.
* A room only becomes "live" for the processor when `rooms.<room>.active === true`; a user's
  code only runs when `users.<user>.active > 0`.

## 5. Handy API endpoints (no auth needed on this server)

```bash
curl -s http://127.0.0.1:23456/api/game/time
curl -s "http://127.0.0.1:23456/api/game/room-objects?room=E11S5&shard=shard0"
curl -s "http://127.0.0.1:23456/api/game/room-terrain?room=E11S5&encoded=1"
```
