# VPS W2N1 — 7 shell sites, 0 builders

HTTP GET only. dest `vps` (`http://screeps.marlyman123.com`). Token worked. No SSH, no world write, **no push**.

Naked-shell sited. Nobody builds. RCL7 `queueBuilder` + builder withdraw floor.

| | |
| --- | --- |
| Polled | 2026-08-16 · ticks **2080326** → **2080615** → **2080660** |
| Host | hostname first; no fallback |
| User | `pacifist` · `5974db007b0e636` · GCL **32.36M** · 5 rooms |
| CPU | last ~24 · 100t avg **21.9** · **bucket 10000** |
| `GET /api/user/branches` main | **2026-08-16T00:52:17.664Z** (after `_vps-after-push` 00:40:52Z) |

Prior: [`_vps-after-push.md`](./_vps-after-push.md) tick **2078303** (6 sites, 0/0 standing). [`_vps-w3n3-walk.md`](./_vps-w3n3-walk.md) already had W2N1 **7 · all p=0**.

---

## Live W2N1

RCL **7** p=183k · DG ~148k (full) · SM avail 1, CD expired · 1-source @17,18.

| | 2080326 | 2080660 |
| --- | --- | --- |
| storage E | **0** (minerals only) | **347** |
| Spawn2 | idle E=300 | idle E=300 · `spawn_list` empty |
| ext E | **4000 / 4000** | **4000 / 4000** |
| towers | 830 / 1000 | — |
| standing roads | **0** | **0** |
| standing ramparts | **2** | **4** @ 26,12–15 (3.8k–110k hits) |
| containers | **0** | **0** |
| links | 3 | 3 (0 / 240 / 800) |
| sites | **7 · all p=0** | **7 · all p=0** |
| builders | **0** | **0** |
| danger / fuse / stall | false / false / 0 | — |

Sites (ours, unchanged, west edge):

- rampart **4,9** and **4,10** (0/1)
- road **1,13** **1,12** **1,11** **1,10** **1,9** (0/300)

Creeps @ 2080660: EnergyMiner, filler, EnergyManager, ControllerLinkFiller, Sweeper, **RampartErector**. No Builder, no Upgrader.

Erector is **not** on these sites. It pops `construction.rampartLocations` and is pumping hub tiles at **26,x**. PlanV2 naked-shell sites sit untouched.

Income path: source → link → controller link (CLF 738e earlier). No containers, no useful drops (99e @20,0 is the north edge). Storage is a trickle. Spawn/ext are full.

`planV2` h=`tmmjwt` syncing. Naked still on (0 roads). Budget in src is **2**; live is **7** because strip keeps every road/rampart site (`PlanV2.ts` broke-strip). Not this bug.

---

## Why 0 builders

RCL7 **does** call `queueBuilder` (danger false, `danger_timer` 0). Cadence is live (`lastTimeSpawnUsed` 2080165, spawn idle).

`queueBuilder` (`rooms.spawning.ts`) then refuses:

1. All 7 sites are rampart or road. At RCL≥6 roads are `continue`'d as not useful; ramparts always are. **`hasUsefulSite` = false**.
2. `!hasUsefulSite` used to mean “rampart-only: one `[W,C,M]`, **and only off a bank**” (`rich` = storage > **15k** at this rung).
3. Storage is 0 / 347. `rich` false. **No builder. Forever.**

That is the same deadlock the function comment already names for “real” structures — `no bank → no builder → no economy → no bank` — reintroduced for the one site class `PlanV2.isShellNaked` is allowed to place under the 80k freeze.

The thin-bank useful-site arm (`want = 1`) never runs, because shell sites are classified as not useful. The 50-part `getBody` RCL7 body is not the issue; the token body never queues.

RCL7’s extra `!danger && danger_timer==0` wrap is **not** the live blocker (danger is false). It would also zero builders if the neighbor `cl*` flips danger again. RCL6/8 do not wrap.

### Withdraw floor (would idle even if one hatched)

`_storageFloorFor` (`creepFunctions.ts`): builder + sites + income + RCL7 → **80k** hard gate (30k/80k/150k, same numbers as the site freeze). Storage 347 never pays.

`withdrawStorage` then calls `acquireEnergyWithContainersAndOrDroppedEnergy()`, which is ruins / tombs / drops / containers. **No spawn. No extension.** W2N1 has 0 containers and no pile worth walking to.

`builder.ts` only leaves that path when `storage` is missing. The storage *structure* stands, so the creep never falls through.

RampartErector uses a bare `withdraw(storage)` (no floor) and its own site list — orthogonal, not a builder.

---

## One src fix (applied, not pushed)

Isolated, ~10 lines. Two files, one behaviour:

1. **`queueBuilder` `!hasUsefulSite`** — drop `rich &&`. One `[W,C,M]` whenever shell-only sites exist. Body stays the token, not the 50-part RCL7 `getBody`.
2. **`builder.ts` refill** — if storage E **< 500** and `energyAvailable >= 550` and sites exist, withdraw spawn/ext (≥50e). Leaves a miner-sized spawn pool. Does **not** open the 80k floor (a 20k bank stays protected).

Live after a push-vps of *this pair only*: Spawn2 has 300 + 4000 ext, 200e body, list empty. Next 35-tick roster tick queues `Builder-*-W2N1`. Then taps ext, builds the west-edge sites.

Naked ends on the first standing road (4 ramparts already exist). `maxSitesFor` returns 0 and strip removes leftover road/rampart sites. Do not expect all 7 to finish.

### Not this change

- 30k / 80k / 150k withdraw numbers
- RCL7 danger wrap
- 7-vs-2 budget leak
- Erector list vs plan sites
- leftover CLF burning the link
- push-vps / SSH / unclaim / Memory write

Did not `push-vps`. Dirty tree still has race / RCL3 / expand work next to this. VPS keeps sitting until an operator pushes this pair alone.
