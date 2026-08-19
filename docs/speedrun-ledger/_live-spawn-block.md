# Live spawn-block — E39N58 / E35N59

2026-08-16T10:44Z. HTTP GET dest `main` (`screeps.com`) shard3 tick **82287681→82287684**. **No src edit. No Memory write. No push. Do not unclaim E36N57.**

PacifistBot `62f89e0d84c31c184db79629` · GCL pts **356.668M** · GCL 12 · CPU 20 · 100t **19.08 / 18.90 / 17.37** · **bucket 9897**.

`modules.main` sha256 `32bd2297cec8353a00be8d77c94e54c5520ac3fb9734333776444bf136449b6b` · **changed** vs 10:28 `5e1c1237…` (not this poll).

Owned **6**: E37N59 E36N57 E37N58 **E35N59** E37N57 **E39N58**. Dropped: E36N58 E36N59 E38N59. **E38N56 unowned.**

## Answers

| Q | E39N58 | E35N59 |
| --- | --- | --- |
| Still ours? | **yes** · in `user/rooms` | **yes** |
| RCL / p / DG | **1** / **2460** frozen / **3266** (82290950) | **2** / **1000** frozen / **629** (82288313) |
| Our spawn / site | **none** / **Spawn3 22,29 13920/15k** (`6a814eb4…`) | **none** / **none** |
| Site being built? | **no this poll.** CB harvesting south. Site **13120→13920** | n/a |
| Foreign spawn | **gone.** Zhaban sites only (16) | **Enrique still** Spawn1 **25,10** `68da3f7d…` 5k/5k e=300 idle |
| CBs / claimers | **1 live · 0 hatching · 0 queued · 0 claimers** | **0 / 0** |
| `spawnSiteUnfinishable` skip? | **no** | **n/a** (no MY site) |

Delta vs 10:30Z: Spawn3 **13120 → 13920** (+800). CB4 at south src **2,40** e112 filling. `danger`/`blown_fuse` **false**.

## Operator (shard3 console; no code push)

Leave **E36N57**. Leave **E35N59** unless attacking Enrique. E39N58 is the finishable extra — CB4 filling south, range **20** (need **3**). Site **≥10k ⇒ cap 1**. Do not mint a second.

`features.autoExpand` **unset = ON**. `features.expandMinRcl` **7** (live default; no RCL7 room). Pointer **idle**. Hold holds (2 spawnless owned). Do not `SC()` / unclaim.

```
# only if you must stop the E39N58 CB
stopExpand()
Memory.features.autoExpand = false
```

`Memory.features.claimRemotes` already absent. **Keep it off.**

## Claimed / colonise

| | |
| --- | --- |
| `Memory.autoExpand` | **`null`** |
| `Memory.target_colonise` | **`{}`** |
| `features` | speedrun / dynamicLayout / minCutWalls / pickupLock **on** · `placeFromPlan` **false** · `expandMinRcl` **7** · **no `autoExpand`** · **no `claimRemotes`** |
| `CanClaimRemote` | **6** (12 − 6 owned) |
| hold | **yes** — `spawnlessOwned()` (E39N58 + E35N59). E37N57 has Spawn6 |
| next pack if hold dies | **E38N56** 2 src empty — also blocked by `expandMinRcl 7` (best owned = E37N59 **RCL6**) |

`danger` / `blown_fuse` **false** both extras.

## E39N58 — spawnless, site live, 1 CB filling south

Ctrl **19,38** ours · RCL1 p=2460 · DG **82290950 (~3266t)** · sma **0**.

| What | Live |
| --- | --- |
| Standing spawn | **0**. Zhaban user still on **16 sites** only (5 ext + 11 road, 0/3k · 0/300) |
| Our site | **Spawn3 22,29 13920/15000**. `6a814eb4dde82e292eeed149`. Not building this poll |
| Creeps | **1** — CB4 at **2,40** harvest 3,41 e112/400 |
| Objects | **22** (ctrl + 17 sites + 2 src + mineral + 1 CB) |

`roomLooksSpawnlessOwned` **true** (owned vision, no MY spawn, no foreign spawn, MY site). Engine cap is free.

### Film — Spawn3 + CBs

| | |
| --- | --- |
| Site | Spawn3 **22,29** **13120 @10:30 → 13920 @82287681** · **+800** |
| CB1–3 | **DEAD** |
| CB4 | `ContainerBuilder-6146803-E37N59` · **E39N58 2,40** · e=**112/400** · fat=**0** · TTL **~156** · `[8W8C8M]` · age 82287840 |
| CB4 mem | `targetRoom: E39N58` · `building: false` · `fill: false` · south-src refill |
| Range to site | **20** (need **3**) |
| Queued | **none**. E37N59 `spawn_list` = 2× remote Carrier (E36N59 / E38N59). Cap **1** (site **≥ 10k**) |

Need **1080**. 8W ⇒ 40/tick once in range. TTL **156** covers ~1 dump now + maybe 1 refill, **not 3**. Expect site ~**14720** when CB4 dies, then dispatcher can mint the next (cap 1 while live).

North src **22,7** 3000. South src **3,41** **2088**.

### `spawnSiteUnfinishable`

`left = 15000 − 13920 = 1080`. `left/20 = **54**`. DG **3266 ≥ 54** → **do not skip.** Live agrees: 1 live CB, 0 queued.

CB4 TTL **156 < 54+walk** — this body will not finish. After death, left≈280–1080 still ≪ DG → still finishable. Do not mint a 2nd while CB4 lives.

25k janitor **82300000** (~12.3k). Live **skips `STRUCTURE_SPAWN`** sites. Spawn3 stays even with 0 creeps. Zhaban ext/road are not ours (`Game.constructionSites`).

## E35N59 — still brick

Ctrl **17,20** ours · RCL2 p=1000 frozen · DG **82288313 (~629t → RCL1)** · sma **1**.

| What | Live |
| --- | --- |
| Leftover | **Enrique still** Spawn1 **25,10** 5000/5000 e=300 not spawning |
| Our spawn / site | **none**. Pack empty |
| Walls | leftover `constructedWall` (no user) |
| Creeps | **0**. Sources 18,6 + 37,20 both 3000/3000 |

`destroy()` fails. Log: `foreign spawn`. RCL1–6 cap is **our** structures — a site on pack tile would be legal. Machine still needs a **finished** MY spawn. `rooms.construction` only sites at **RCL1**; window closed until DG **82288313**.

### `spawnSiteUnfinishable`

**Does not apply.** No MY spawn site → returns `false`. Skip is **`roomLooksSpawnlessOwned`**: owned rooms have vision (controller), Enrique `!my` spawn → **false**.

0 CBs / claimers here. Cover-all correctly prefers E39N58.

## E37N57 — still spawned

Ctrl **22,10** ours · **RCL2** p=3281 · DG **~9988t** · sma **1**.

**Spawn6 standing** 26,29 e=154 idle · hits 5k. **10** creeps: 1 miner · 4 UG · 2 CA · 2 builder · 1 sweeper. Sites: 5 ext **still 0/3k** + hub **3900/5k**. Hold does **not** include this room. Energy is on src/hub, not ext.

## Why extras die / live dispatcher

E37N59 storage **3962** · Spawn1 idle · queue **2× Carrier remotes**. Only finishable extra is **E39N58**. E35N59 filtered on vision. E36N58 dropped (do not reclaim). E37N57 already has Spawn6.

`autoExpand` **null**. Hold blocks `pick()` **E38N56**. `expandMinRcl 7` would also block (no RCL7). Do not push to change that.

Do not attack / dismantle Enrique this pass. Do not unclaim E36N57.
