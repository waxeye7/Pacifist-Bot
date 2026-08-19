# Cycle-19 stall — E11S6 / E12S3 leftover-2W, **not** c18 blackout

`run-2026-08-16T07-40-10Z` · `cycle-19-5w-only` · seed0 **4891503** · e2 E11S6 **1231** · E12S3 **1648**.
redis `memory:pacifist1` + mongo `rooms.objects` + `users.code` + `users.notifications`.
Watch **40404** left running.
No `push-race`. No seed. No src.

**Cause:** leftover **2W/1W** + `fiveWQueued` latch. Dest heal is `homeWork < 4` and only rewrites an EnergyMiner **550-head** when `available < 550`. A live **2+2** (`homeWork=4`) does **not** fire; a 550-fill + non-EM head also does not. `lastSpawn` is queue stamp — 5W waits TTL or 1500. **Not** c18: no 1W parked at spawn, no 5W-head sitting at fill 54, no stale `lastUsed` 6k, **no DG**.

Flag (ledger): E11S6 L2 **p=7891 c=12** · E12S3 L2 **p=15618 c=6**. Both **crawled**, then 5W hatched. Pair E8S3 already L3.

## Dest — cheap-miner **IS** harden (`homeWork<4`)

| dest | user / branch | `users.code` ts | cheap-miner |
| --- | --- | --- | --- |
| **`pacifist`** (cand) | `pacifist1` main `activeWorld` | **2026-08-16T07:39:58Z** (seed-clean) | **yes** `homeWork < 4` → `[2W,M]`/`[W,M]` |
| `race` (ctrl) | `pacifist-race` main | 2026-08-06 (`e839fc8`) | **no** |

Gate (modules.main): head `EnergyMiner` · `cap>=550` · `available<550` · `bodyCost>=550` · then `if (homeWork < 4)`. Comment: leftover 1W is not income; **a live 2W (4 WORK) can**. `liveMiners===0` **absent**. `values.lastSpawn = 0` = self-heal only (`no miner alive or queued`). sticky / overlap **absent**. `overlap4WQueued` on E11S6 Memory is **stale**.

## Clocks

seed E11S6 **4891689** · E12S3 **4891585**. leftover-5 **HOLD** 5/550. L2 **0/0** roads.

| probe | tick | elapsed | E11S6 | E12S3 |
| --- | ---: | ---: | --- | --- |
| 5W-film D | 4897098 | 5595 | 2+2 · p 5999 · 4/500 | 2+2 · p 5608 · 2/400 |
| **flag** | ~49066–073 | ~15.2k | L2 **p=7891 c=12** | L2 **p=15618 c=6** |
| A mongo | **4907692** | 16189 | **2+2** · p **8389** · fill **5** · spawn UG | **1+2** · p **16089** · fill **550** |
| R1 redis | **4908044** | 16541 | head **`[4C,4M]`** stall **29** | head **`[W,2C,2M]`** stall 0 |
| B mongo | ~49087xx | ~17.2k | **2+2** · p **9663** · fill **550** | **5+5** · p **18112** |
| R2 redis | **4908977** | 17474 | `[]` stall 0 · lastSpawn 281/613 | `[]` · lastSpawn 539/1145 |
| C mongo | **4909423** | 17920 | **2+5** · p **12076** · fill **550** | **5+5** · p **21269** |
| lastSeen | **4909570** | 18067 | L2 **p=13441** c=13 | L2 **p=21985** c=21 |

No E11S6 / E12S3 DG notif. Cand L3 already: E13S7 / E12S1 / E5S3 / E16S9. Ctrl pair **E8S3 L3** at 4909435. E13S9 still L2 p≈45k.

## Film table

`lastSpawn` = **queue stamp**, not hatch. `fiveWQueued` **true** both src both rooms all probes.

| room | L / p | miners WORK | sit | fill | head | stall | lastSpawn age | lastUsed age |
| --- | --- | --- | --- | ---: | --- | --- | --- | --- |
| **E11S6 A** | 2 / **8389** crawl | **2+2** | **src 30,20 + 47,3** | **5** | UG in spawn | — | 867 / 1187 | **30** |
| **E11S6 R1** | 2 | 2+2 | mining | (empty) | **`[4C,4M]` 400** | **29** CA | same | 30 |
| **E11S6 C** | 2 / **12076** | **2+5** | near 2W · far 5W 47,4 | **550** | `[]` | 0 | 281 / 613 | 4 |
| **E12S3 A** | 2 / **16089** crawl | **1+2** | src 47,33 + 36,10 | **550** | **`[W,2C,2M]`** | 0 | 1109 / **212** | 111 |
| **E12S3 C** | 2 / **21269** | **5+5** | 36,10 + walk 39,26 | **550** | `[]` | 0 | 539 / 1145 | 167 |

### E11S6 — **not** c18 freeze

c18: p **6861 frozen** · **1W at spawn 26,20** not walking · both src **3000** · fill **54–237** · head **`[5W,M]` 550** · `lastUsed` **~6576** · dest `liveMiners===0` gated · then **DG L1 ×2**.

c19 A: miners **on seats** (near 30,21 L=4 · far 46,3 L=24). src 2168/2548. Boxes ~0. Site box 15,24 2170/5000. 0 roads. Roles A: Filler + 3 CA + 3 UG + B + 2 EM + Repair · spawning `[2W,2C,2M]`. Fill **5** because CAs/UGs sat the far src (47–48,4–7) not the spawn. Heal **idle** (`homeWork=4`). Head R1 is a **400 CA**, not HOL-550. `lastUsed` fresh. p **7891→8389→9663→12076→13441**. Far 2W died (ttl 4908687) → lastSpawn 4908696 → **`[5W,M]`** `…4499902` ttl 4910214 @47,4. Near still leftover **2W** ttl 4909876.

### E12S3 — leftover 1W+2W, then c18-style recover

A: **1W** far 46,34 (ttl 4907841, ~150 left) + **2W** near 36,9. Both src ~full. `homeWork=3` but fill **already 550** + head is a **builder** → heal gate closed. `fiveWQueued` blocked a new 5W. B/C: leftover dead, **5+5** live (far 5W walking 39,26). Same recover as `_cycle18-stall.md` E12S3 (1W@spawn then 5+5). p **15618→21985**. Far-ctrl depot **cargo**: box site 18,30 (ctrl 19,27). Hub box site 31,22. 0 roads (L2).

## vs cycle-18 E11S6 blackout

| | c18 E11S6 | c19 E11S6 | c19 E12S3 |
| --- | --- | --- | --- |
| p | **6861 frozen** | **7891 crawl** → 13k | **15618 crawl** → 22k |
| miners | **1W @ spawn** | **2+2 on src** → 2+5 | **1+2 on src** → 5+5 |
| fill | **54–237** | 5 then **550** | **550** already |
| head | **5W 550** HOL | **4C4M** then `[]` | builder 300 then `[]` |
| lastUsed | **6576** stale | **4–30** | 111–167 |
| dest heal | `liveMiners===0` | `homeWork<4` | same; fill≥550 so idle |
| DG | **L2→L1 ×2** | **none** | **none** |
| 5W | after leftover died + 2 wraps | far 2W TTL → 5W | leftover TTL → 5+5 |

## Hypothesis

| claim | film |
| --- | --- |
| same as c18 E11S6 blackout | **no** — mining, fill hits 550, no DG, p climbs |
| dest missing cheap-miner | **no** — `homeWork<4` since seed 07:39Z |
| leftover 2+2 (`homeWork=4`) blocks 5W | **yes** — heal idle; latch holds lastSpawn |
| HOL-550 + empty fill | **no** on these two (heads were CA/UG/builder) |
| E12S3 recovered | **yes** — 5+5 by B |
| E11S6 recovered | **partial** — far 5W live; near still 2W |
| leftover-5 | **HOLD** ext=5 both |
| RCL2 roads | **0/0** |

Not KEEP / SEND BACK (pile). 5W hatch works once leftover dies and fill is 550. Heal still misses the `homeWork==4` + latch window.

Did: redis `memory:pacifist1` + mongo objects + dest `users.code` + notifications. Did **not**: push-race, seed, reset, git push, unclaim, SSH, src.
