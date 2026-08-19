# Cycle-20 E18S9 — last to L3, dest-cheap L2 loop, **not** c19 `_still`

`run-2026-08-16T08-58-29Z` · `cycle-20-5w-only` · seed0 **4932291** · seed E18S9 **4932291** · e2 **1821** · e3 **26274**.
mongo `rooms.objects` + redis `memory:pacifist1` + `users.code` + `users.notifications`.
Watch **19568** left running.
No `push-race`. No seed. No src.

**Cause:** leftover **2W / 1+1** + `fiveWQueued` + HOL-550. Dest heal is `homeWork < 2` and only rewrites a **550-EM** head when `available < 550`. A live **2W** (`homeWork=2`) does **not** fire; **1+1** is also work=2. `lastSpawn` is queue stamp — 5W waits TTL or 1500. Fill sat **65–396** so HOL `[5W,M]` starved. Was **1×2W** (near seated, far dark) then dest-cheap **1+1**. Recovered **5+5** late (`lastShrink` **4954950**). Climbed p **11950→39847→44363**, **last** cand L3. **Not** c19: that stall was already L3, dest `WORK<4` dirtied 5W, 1W `_still` 1208 at 36,12, 52 roads.

Flag / user film: L2 **p=39847 / 45000** (late climb, already 2×5W). Ledger L3 **4958565**. Pair ctrl **E8S5 e3=15714**.

## Dest — cheap-miner **IS** WORK&lt;2

| dest | user / branch | `users.code` ts | cheap-miner |
| --- | --- | --- | --- |
| **`pacifist`** (cand) | `pacifist1` main `activeWorld` | **2026-08-16T08:57:49Z** (seed-clean) | **yes** `homeWork < 2` → `[2W,M]`/`[W,M]` |
| `race` (ctrl) | `pacifist-race` main | 2026-08-06 (`e839fc8`) | **no** |

Gate (modules.main): head `EnergyMiner` · `cap>=550` · `available<550` · `bodyCost>=550` · then `if (homeWork < 2)`. `liveMiners===0` **absent**. `homeWork < 4` **0**. Heal only rewrites a **550-EM** head — idle on CA/UG. `fiveWQueued` then holds `lastSpawn+1500`.

## Clocks

leftover-5 **HOLD** ext **5 / 550**. L2 **0/0** roads. L3 **0/0** (`paveNow` gone). 0 E18S9 DG. Notif **09:45:17Z** L3.

| probe | tick | elapsed | p | miners WORK | fill | head (`spawn_list`) | stall |
| --- | ---: | ---: | ---: | --- | ---: | --- | ---: |
| 5W-film A–C | 4937–399k | 5–8k | ~4–7k | **2+2** pre-slam | <550 | 2W (cap&lt;550) | — |
| **flag / snap** | **4948284** | 15993 | **10982** | **1×2W** | — | — | — |
| stall A | 4949015 | 16724 | **11340** | **2** near 45,5 · far **3000** | **122** | **EM `[5W,M]` 550** | **126** |
| stall B | ~4950121 | 17830 | **11576** | **1+1** both seats | **396** | dest cheap | — |
| stall C | 4950769 | 18478 | **12256** | **2** walk 32,14 | **65** | HOL → dest **`[2W,M]`** | 11 |
| 5W-film D | **4950873** | 18582 | **11950** | **1+1** 20,39 + 45,5 | **202** | UG `[2W,2C,2M]` | 6 |
| lastInterleave / lastShrink | 4954424 / **4954950** | 22659 | — | dest rewrite / HOL shrink | — | — | — |
| **user** | ~**49570xx** | ~24.7k | **39847** | **5+5** (climb) | ≥550 | not snapshotted (not HOL) | 0 |
| RUNNING | **4957948** | 25657 | **44363** | **2×5W** still L2 | — | — | — |
| **L3** | **4958565** | **26274** | wrap | near 5W live | — | — | — |
| film A | **4959320** | 27029 | **5103** L3 | **5+5** 45,5 + 20,39 | **550** | `[]` | 0 |
| film B | **4960348** | 28057 | **11567** L3 | **5+5** | **500** | UG in spawn | 0 |

p **10982→12256** = **+1274 / ~3.3k** (**0.39 e/t**) — dest-cheap. **11950→44363** = **+32413 / 7075t** (**4.58 e/t**) — 5W recover. **39847** sits on that climb (~1k t before 44363). Last 617 t of L2 (**44363→45000**) **1.03 e/t** (tower). L2 age 23.8k → **1.86 e/t** overall. Need was 45k; it **hit**.

## Why last to L3

Cand e3: E13S7 **10503** · E5S3 15663 · E12S1 15865 · E16S9 16353 · E12S3 18920 · E18S5 19906 · E11S6 **22907** · **E18S9 26274**.

| vs | E18S9 e3 | Δ |
| --- | ---: | ---: |
| leftover-5 best (own) | 12828 | **+13446** |
| c10 no-box | 15779 | **+10495** |
| c19 this room | 18487 | **+7787** |
| pair ctrl E8S5 | 15714 | **+10560** |
| next-slow cand E11S6 | 22907 | **+3367** |

Geometry is the floor (~16k): 1-seat plains (45,5)/(20,39), far L=**31**, spawn→ctrl **9 / 5 swamp**, src→ctrl 18/31. Overlap 5W while a 2W sits is a **no-op**. Extra this seed is the **L2 cheap loop**, not leftover-5 (every cand held 5) and not roads (0/0).

E11S6 same family (leftover 1W @26,20) **lucked a 5W** at stall C (fill 350). E18S9 kept looping: dest idle at `homeWork=2`, HOL-550 at fill 65–202, latch to `lastSpawn+1500`. `lastShrink` only **4954950** — **4.2k after E11S6's 5W**, **7.6k after slam**. Then 5W climb ~7k t to wrap.

## Film — miners / spawn_list / energyAvailable / leftover-5

`lastSpawn` = **queue stamp**, not hatch. `fiveWQueued` **true** both src all probes. `overlap4WQueued` **false**. `planV2` absent · `planPackMiss` live. `speedrun.rclTimes` **stale** (old world) — ledger e2/e3 is truth.

| | D **4950873** L2 | film A **4959320** L3 | film B **4960348** L3 |
| --- | --- | --- | --- |
| L / p / ext / cap | **2 / 11950 / 5 / 550** | **3 / 5103 / 5 / 550** | **3 / 11567 / 5 / 550** |
| leftover-5 | n/a L2 slam-5 | **HOLD** 0 ext sites | **HOLD** |
| `energyAvailable` | **202** | **550** | **500** |
| `spawn_list` | UG `[2W,2C,2M]` | `[]` | UG in spawn (`…4094663`) |
| `spawnStall` | 6 | 0 | 0 |
| `lastTimeSpawnUsed` age | — | ~**43** (4959634 @ 4959677) | fresh |
| lastSpawn (near/far) | **4949216 / 4949408** | 4957841 hatch / 4959147 hatch | **4959339 / 4959129** |
| lastSpawn age | **900 / 1092** | — | 338 / 548 @ 4959677 |
| roads / sites | **0 / 0** | **0 / 0** | **0 / 2** src-seat boxes |
| tower / boxes | none · 35,11 / 32,8 / 35,12 | **34,8 1000e** · hub **2000** · 32,8=0 · 35,12=754 | same · 35,12=905 · seats 10/0 of 5k |
| src 46,4 / 19,40 | harvesting 1W+1W | 1270 / 1470 | **90** / 1910 |
| creeps | — | 13 · 4 UG + 5 CA + 2 EM + filler + repair | 17 · 5 UG + 7 CA + B + 2 EM |

### Miners

| when | miner | body | sit | src | note |
| --- | --- | --- | --- | --- | --- |
| flag | leftover | **`[2W,M]`** | **45,5** | 46,4 | **1×2W**. Far dark. dest idle (`homeWork=2`). |
| stall A | `…3926798` | **`[2W,M]`** | 45,5 | 46,4 | `harvested`. Head HOL 5W far. |
| stall B / D | two 1W | **`[W,M]`** | 45,5 + 20,39 | both | dest `homeWork<2` after 2W TTL. Latch blocks 5W. |
| stall C | `…533483` | **`[2W,M]`** | walk **32,14** | far | dest rewrote HOL. fill **65**. |
| user / RUNNING | — | **`[5W,M]`×2** | seats | both | recover after `lastShrink` 4954950. p **39847→44363**. |
| film A | `…4329433` / `…4496873` | **`5W1M`** | **45,5 / 20,39** | 46,4 / 19,40 | harvest. spawn-complete **4957841 / 4959147**. |
| film B | `…4076963` / `…4496873` | **`5W1M`** | **45,5 / 20,39** | same | near replaced @ **4959357**. 0 1W/2W. |

Near lastSpawn **4959339** = the film-B 5W (not a dest-dirty). Far lastSpawn **4959129** = live far 5W. Latch inside 1500 both — next 5W blocked until TTL, **correct** (already 5+5).

## vs cycle-19 E18S9 stall

c19 (`_cycle19-e18s9.md`): already **L3 e3=18487**, p **7622→11053→12277** crawl, dest **`homeWork<4`** dirtied G **5+5 → 1+1**, near `[W,M]` **parked 36,12** (`_still` **1208**, `MoveTargetId` `road|…3403`), src **46,4 = 3000**, fill **52–300**, head **CA / [] / UG 550**, roads **52 / 1**, DNF RCL4.

| | c19 **E18S9** | **c20 E18S9** |
| --- | --- | --- |
| when | **L3** p~11k | **L2** p 11k→**39847**→L3 |
| e3 | **18487** | **26274** last |
| miners | **1W stuck 36,12** + far 2W | **1×2W → 1+1 → 5+5** on seats |
| dark src | **near 3000** (stuck 1W) | far 3000 @A · near @C · then both live |
| fill | 52–300 | **65–396** then **550** |
| head | CA / UG 550 | **HOL 5W** then dest 2W/1W · late `[]`/UG |
| dest heal | `homeWork<4` **dirtied 5W** | `homeWork<2` **idle on 2W**; fired on TTL |
| lastUsed | 31–503 | **fresh** (43) |
| leftover-5 | HOLD 5/550 | **HOLD** 5/550 |
| roads | **52 / 1** | **0 / 0** |
| DG | none | **none** |
| 5W | G 5+5 then dest dirty | late **5+5 held** (WORK&lt;2) |
| outcome | L3 crawl **DNF RCL4** | **hit L3** · 5+5 now |

Same **family** (cheap leftover + a dark source + leftover-5 HOL). **Not** the same machine: c19 is dest-dirty + `_still` park on L3. c20 dest does **not** replace a live 2W; the miss is `homeWork==2` + latch + empty fill on **L2**. Geometry + that loop is why this seed is last, not a new park bug.

c20 **E13S7 / E5S3 / E12S1 / E16S9** counterexample: **5+5** by slam, e3 **10.5–16.4k**. The 18-hole is this room's leftover+latch, not 5W hatch.

## Hypothesis

| claim | film |
| --- | --- |
| same as c19 E18S9 `_still` park | **no** — L2 not L3; on-seat or walking; 0 roads; dest WORK&lt;2 |
| dest missing cheap-miner | **no** — `homeWork<2` since 08:57Z; B/C/D 1W/2W hatches are it |
| dest `WORK<4` dirties 5W | **no** — live 2W kept 5W-head (stall A); late 5+5 held |
| leftover 2W / 1+1 (`homeWork=2`) blocks 5W | **yes** — heal idle; latch holds lastSpawn |
| HOL-550 + empty fill | **yes** A/C/D fill 65–202 |
| was 1×2W | **yes** flag/snap · far dark |
| p=39847 still L2 | **yes** late 5W climb; wrap 617 t later |
| leftover-5 | **HOLD** ext=5 · 0 ext sites |
| RCL2/3 roads | **0/0** · L3 src-seat boxes only @B |
| last because geometry only | **no** — floor ~16k; extra **+7.8k vs c19** is the L2 cheap loop |

Not KEEP / SEND BACK (pile). 5W hatch **works** once leftover dies **and** fill is 550. Heal still misses the `homeWork==2` + latch window — that is why this room was last. Now L3 **5+5**, p **11567**, leftover-5 HOLD. Mark **29029** / this-ctrl **31044**.

Did: redis `memory:pacifist1` + mongo objects + dest `users.code` + notifications. Did **not**: push-race, seed, reset, git push, unclaim, SSH, src.
