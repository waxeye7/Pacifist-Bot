# Live after `push-main` (maybeSpawnColonyBuilder + CLAIMED_SPAWNLESS + naked-shell)

HTTP GET only. dest `main` (`https://screeps.com`) shard3. No SSH, no Memory write, no second push. **Do not unclaim E36N57.**

**Push landed.** `GET /api/user/code?branch=main` `modules.main` sha256 `1d7de628ed790e457c25676de3f3356f4c72c1ec31aff873645fdfd292852bc6` (same bundle as VPS). Needles present: `maybeSpawnColonyBuilder` / `finishableSpawnSiteRoom` / `CLAIMED_SPAWNLESS` / `spawnlessOwned` / `isShellNaked` / `nakedShell`. CPU 60.50 spike then 20.49 — global reset **~56 ticks** before this poll (~**82277842**).

Raw: [`_live-after-push.poll.json`](./_live-after-push.poll.json). Prior: [`_live-empire.md`](./_live-empire.md) tick **82277811**.

| | |
| --- | --- |
| Polled | 2026-08-16T00:47:58Z |
| `GET /api/game/time` | **82277898** → **82277900** |
| User | PacifistBot `62f89e0d84c31c184db79629` · GCL pts **356.510M** → **GCL 12** · CPU 20 |
| CPU | last 13.67 · 100t avg 11.82 · **bucket 10000** |
| Owned | **7** — E37N59, E37N58, **E36N57**, E35N59, E39N58, E36N58, E37N57 |

---

## Answers

| Room | Q | Live |
| --- | --- | --- |
| **E36N58 / E37N57** | CB incoming? spawn site progress? | **No / no.** Sites still **0/15000**. 0 creeps in either room. Only live CB is walking **E36N59 → E35N59** (old colonise). Queue CB is also **E35N59**. |
| **E36N57 KEEP** | still owned, spawn up? | **Yes / yes.** Owner us. Spawn5 **21,27** ours, idle E=300. |
| **E35N59 / E39N58** | still blocked? | **Yes.** Enrique Spawn1 **25,10** · Zhaban Spawn1 **32,17**. 0 our spawn / site. |
| **E37N59** | sites (storage 29k < 30k freeze) | **0 sites.** Storage **28669**. 120 roads + 77 ramparts → not naked → budget **0**. Freeze held. |

Do not unclaim anything.

---

## E36N58 / E37N57 — no CB yet

Both ours, RCL1 p=0, 0 creeps, 0 standing spawns.

| Room | DG | Our site |
| --- | ---: | --- |
| E36N58 | **5308** | Spawn3 **42,6 · 0/15000** |
| E37N57 | **5099** | Spawn6 **26,29 · 0/15000** |

`finishableSpawnSiteRoom` should pick these (owned, no MY spawn, no foreign spawn, our spawn site). It has not queued them this poll.

**Why:** `add_creeps_to_spawn_list` (and therefore `maybeSpawnColonyBuilder`) only runs on an empty `spawn_list` or `Game.time % 500 == 0`. E37N59 list is **not** empty:

1. Live `ContainerBuilder-81420124-E37N59` — `targetRoom: **E35N59**`, `fill: false`, standing **E36N59** (dropped). Pre-push colonise CB.
2. Queued `ContainerBuilder-66184243-E37N59` — `targetRoom: **E35N59**`, `fill: true`. Leftover `target_colonise` head.
3. Spawn1 hatching `EnergyMiner-34974841-E37N59` done **82277913**, then queued EnergyMiner-67281035, then that CB.

Next refill window: **82278000** (`% 500`, ~100 t) or when the list drains. Then mother should be **E37N59** (only funded: storage 28.7k > 10k; E37N58 is 7.5k; E36N57 has no storage). Closest finishable is **E36N58** (lin 1 vs E37N57 lin 2).

25k janitor still **82300000**. Sites stay until then if 0 my creeps.

---

## E36N57 KEEP — still ours, spawn up

Owner **PacifistBot**. In `user/rooms`. Not expand/colonise target.

RCL **3** p=89884 · DG **full ~19961** · Spawn5 **21,27** idle · tower 18,20 e=1000 · 10 ext (350/500) · 5 containers · **10** road sites 0/300 · 17 creeps (5U 8C 2EM 1filler 1Repair) · 0 foreign · SM expired (end 82270833), 1 avail, CD 82300833 · `danger` / `blown_fuse` false.

Leave it.

---

## E35N59 / E39N58 — still blocked

| Room | RCL | p | DG | Leftover | Ours |
| --- | ---: | ---: | ---: | --- | --- |
| **E35N59** | 2 | 600 frozen | **5691** | Enrique Spawn1 **25,10** user `68da3f7d7b34b70012d9c41e` | 0 spawn / site / creeps · 532 walls |
| **E39N58** | 2 | 2280 frozen | **3049** | Zhaban Spawn1 **32,17** user `68662bcb27d90f00122a8c7a` | 0 our sites · 16 foreign (5 ext + 11 road) |

Pack tiles empty (28,20 / 23,27). Foreign spawn ⇒ `roomLooksSpawnlessOwned` false — new CB dispatcher must **not** send here. Live + queued CBs still will (old `target_colonise`). They cannot finish a MY spawn (RCL1–6 cap 1).

---

## E37N59 — freeze held (not naked)

RCL6 p=230k · storage **28669** + term 200 · **< 30k** · Spawn1 21,24 hatching · 10 creeps · **0 sites**.

120 roads + 77 ramparts → `isShellNaked` false → `maxSitesFor` **0**. No lab/nuker/ext/road/rampart sites. Strip held.

E37N58 (RCL4, not in the 30k rule): storage 7500 · 0 sites · Spawn4 hatching · 22 roads / 17 ramparts.

---

## AutoExpand (read-only)

| | |
| --- | --- |
| `Memory.autoExpand` | still `{ room: E35N59, spawnPos: 28,20, phase: "claimed", since: 82272940, started: 82271500 }` · **~4958** in `claimed` |
| `CLAIMED_SPAWNLESS` 8000 | fires **82280940** (~**3042** t) then `finish` |
| `spawnlessOwned` hold | after that finish, E36N58 / E37N57 should block `pick()` (E38N56 next in pack) |
| `Memory.target_colonise` | still **E35N59** 28,20 · `lastSpawnRanger` 82271501 |
| `features.autoExpand` | **unset = ON** · no `claimRemotes` · speedrun / dynamicLayout / minCut / pickupLock **on** · `placeFromPlan` **false** |
| `CanClaimRemote` | **5** (12 − 7) |

PHASE_TIMEOUT 20k still **82292940**. New 8k abort is earlier.

Dropped still in Memory.rooms: E36N59, E38N59, E39N59. E36N59 leftover our Spawn2 site **3500**/15k + the passing CB. E38N59 leftover our Spawn7 site **0**/15k.

`danger` / `blown_fuse` false on all named rooms. 0 hostiles.

Do not push-race. Do not unclaim E36N57. No Memory write. No SSH.
