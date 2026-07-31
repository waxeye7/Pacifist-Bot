# Local private-server tooling

Everything here talks to the **local disposable test server** (docker compose):

| container | role |
| --- | --- |
| `local-screeps-server-screeps-1` | game server (host `127.0.0.1:23025` → container `21025`) |
| `local-screeps-server-mongo-1` | mongo, db `screeps` |
| `local-screeps-server-redis-1` | redis |

Mods: `screepsmod-mongo`, `screepsmod-auth`, `screepsmod-admin-utils`, `screepsmod-map-tool`, `screepsmod-history`.

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
242 rooms) plus the one-off `W0S5`, wrapped in a ring of `status: "out of borders"` all-wall
rooms (`W0*`, `*N0`, `*S11`, `E22*`). Every playable room chains exits to its neighbours; the
north (`*S0` top), south (`*S10` bottom) and far-east (`E21` right) edges are sealed against
the ring.

`bus: true` marks highway rooms — the rule is `roomX % 10 == 0 || roomY % 10 == 0`, and the
*original* highway rooms (`E0*`, `E10*`, `*S0`, `*S10` of the first grid) have **no sources
and no controller**. Rooms added later (`E11`–`E21`, `W0S5`) deliberately break that: they all
carry 2 sources + controller + mineral for planner testing, so they are stored with
`bus: false` regardless of position.

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

## 4. `spawn-in.mjs` — drop the bot into a room at its planned spawn

```bash
# plan the room first (plan.mjs REWRITES plans-hub.json with only the rooms it planned,
# so prefer --all-claimable unless you are fine losing the other entries)
fnm exec --using 22 node tools/plan-suite/v2/plan.mjs --all-claimable

fnm exec --using 22 node tools/server/spawn-in.mjs E11S5 --dry-run
fnm exec --using 22 node tools/server/spawn-in.mjs E11S5
```

Options: `--user <username>` (default: auto-detect the `pacifist` account),
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
curl -s http://127.0.0.1:23025/api/game/time
curl -s "http://127.0.0.1:23025/api/game/room-objects?room=E11S5&shard=shard0"
curl -s "http://127.0.0.1:23025/api/game/room-terrain?room=E11S5&encoded=1"
```
