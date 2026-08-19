# Cycle-21 E18S5 — leftover 2W + HOL-550, dest-cheap **idle** (not eating 5W)

`run-2026-08-16T10-19-31Z` · `cycle-21-rcl3-haul` · seed0 **4972839** · seed E18S5 **4973218** · e2 **1370**.
Dest-21 compile: leftover-5 + 5W HOL + dest-cheap **`homeMinerBestWork < 2`** + no-RCL2-roads + L3 `paveNow`. Src dest-22 `=== 0` **not** in dest. lastSpawn=0 poke **absent**.
Watch **42424**. No `push-race`. No seed. No src.

**Cause:** leftover **1×2W** on slam-5 + `fiveWQueued` + HOL-exempt `[5W,M]` while fill never hits 550. Dest-21 dest-cheap is `bestWORK < 2`. A live **2W** (`bestWORK=2`) **does not fire**. **Not** dest-cheap eating the 5W at last fire. **Not** leftover 2W dead. **Not** c16 0-miner blackout. **Not** c19 `WORK<4` dest-dirty.

Last fire (`_cycle21-pave-watch.md`, mongo ~**4981949**): E18S5 **1×2W**. Other slam-5 rooms **5+5** (E18S9/E11S6 still 2+2 then recovered). lastSeen then **crawled**, then **partial climb**. Pair ctrl **E6S1 hit L3**.

## Dest — cheap-miner **IS** WORK&lt;2 (dest-21)

| dest | compile | cheap-miner |
| --- | --- | --- |
| **`pacifist`** (cand) | dest-21 seed-frozen | **`homeMinerBestWork < 2`** → rewrite HOL `[5W,M]` to `[2W,M]`/`[W,M]` |
| `race` (ctrl) | `e839fc8` | **no** |
| src now (not dest) | dest-22 staged | `=== 0` only |

Gate (`rooms.spawning.ts` dest-21): head `EnergyMiner` · `cap>=550` · `available<550` · `bodyCost>=550` · then `if (bestWORK < 2)`. Heal **idle** at work=2. `fiveWQueued` holds `lastSpawn+1500`. `lastSpawn=0` poke **absent** (stale-heal only). Miner-first L2 also `bestWORK < 2` — leftover 2W **does** pass CA/UG (7–14 creeps).

Src dest-22 is `=== 0`. Dest-21 compile stays `< 2`.

## Clocks

leftover-5 **HOLD** ext **5 / 550**. L2 **0/0** roads (pave-watch). Pave **inert** (still L2). 0 E18S5 RCL3. Pair **E6S1 e3=16720**.

| probe | tick | elapsed | E18S5 | miners |
| --- | ---: | ---: | --- | --- |
| snap | 4978690 | 5851 | L2 p=7781 / **3**/350 | 2W (cap&lt;550) |
| **last fire** | **4981949** | **9110** | L2 **p=8752** / **5**/550 · roads **0+0** | **1×2W** thin |
| dash | 4989452 | 16613 | L2 **p=9435** c=10 | (no bodies) |
| lastSeen | **4990135** | **17296** | L2 **p=11598** c=14 | (no bodies) |

p **8752→9435** = **+683 / 7503t** (**0.09 e/t**) — freeze after last fire. **9435→11598** = **+2163 / 683t** (**3.17 e/t**) — recover, **not** 5+5 (c20 5W climb was **4.58 e/t**). L2 age 16.9k → **0.69 e/t** overall. Need **~33k**. **~22.7k** left. **DNF** unless 5W holds.

## Last fire — 8 cand miners (mongo `rooms.objects` ~4981949)

| room | L/p | ext | roads+sites | miners WORK | 5W |
| --- | --- | ---: | --- | --- | --- |
| E5S3 | 2/17330 | **5** | **0+0** | **5+5** | **pass** |
| E12S3 | 2/12733 | **5** | **0+0** | 2+**5+5** | **pass** |
| E16S9 | 2/15658 | **5** | **0+0** | **5+5** | **pass** |
| E12S1 | 2/19986 | **5** | **0+0** | **5+5** | **pass** |
| E13S7 | 2/37363 | **5** | **0+0** | **5+5** | **pass** |
| E18S9 | 2/7707 | **5** | **0+0** | 2+2 | thin then **L3 14261** |
| E11S6 | 2/7013 | **5** | **0+0** | 2+2 | thin then p **38k** |
| **E18S5** | 2/**8752** | **5** | **0+0** | **1×2W** | **fail** |

Sources 9,21 + 12,33 (3+11 from anchor 8,32). Ctrl 8,9 **25 steps**. One dark source + one 2W is the income floor (~4 e/t harvest, less on the 45k).

## spawn_list / fill / leftover 2W — dest-21 math (no new redis this write)

This agent has no docker exec. Head/fill **not** re-probed. Inferred from dest-21 compile + last-fire body + lastSeen roster.

| Q | answer |
| --- | --- |
| dest-cheap eating 5W? | **No at last fire.** `bestWORK=2` → `< 2` **false**. Heal idle. |
| leftover 2W dead? | **No.** 1×2W live. Miner-first did not break (creeps 7→14). |
| spawn_list head? | **Likely HOL `[5W,M]`** (same as c20 E18S9 A): producer unshifts 5W at slam-550, `fiveWQueued`, fill &lt;550, dest idle. Could be CA/UG if lastShrink / dest already rewrote after TTL. **Unproven without redis `rooms.E18S5.spawn_list`.** |
| fill? | **&lt;550** while 5W sits (else it would have hatched). last-fire 1×2W + dark src cannot keep a leftover-5 net at 550 through interleave. **Unproven exact `energyAvailable`.** |

`lastSpawn` is **queue stamp**. Once 5W is unshifted, latch is 1500 even if dest later rewrites the body. dest-22 does **not** clear that stamp.

## dest-22 `=== 0` — would it have helped?

| window | dest-21 `< 2` | dest-22 `=== 0` | help? |
| --- | --- | --- | --- |
| last fire leftover **2W** | idle | idle | **no** |
| leftover 2W + HOL-550 + fill 65–400 | idle (c20 E18S9 A) | idle | **no** — fill starve, not dest-eat |
| leftover **dies to 0** | rewrite 5W → 2W/1W | **same** (0-miner heal) | **no** — both fire |
| leftover **1W** still filling | **rewrite** HOL 5W (c20 B) | **keep** 5W | **yes** — the dest-22 knob |
| 0-miner HOL-550 (c16 E18S5) | rewrite | rewrite | n/a (heal stays) |

**dest-22 would not have unstuck last-fire.** The live miss is leftover **work=2** + latch + empty fill, same family as c20 E18S9 stall A. dest-22 only pays if leftover drops to **1W** and dest-21 then eats the next HOL 5W. That second cycle is **not** on the last-fire film (1×2W, not 1W).

## vs earlier E18S5 / E18S9 stalls

| | c16 E18S5 | c20 E18S9 | **c21 E18S5** |
| --- | --- | --- | --- |
| when | L3 p frozen 9438 | L2 last to L3 | **L2** p 8.7k→9.4k freeze→11.6k |
| miners | **0** | 1×2W → 1+1 → 5+5 | **1×2W** |
| dest | HOL-550 no cheap (`liveMiners===0` / poke) | `< 2` idle on 2W; fired on TTL | **`< 2` idle on 2W** |
| dest-eat 5W? | n/a (0 miners) | yes after TTL / 1W | **not at last fire** |
| outcome | DG L3→L1 | hit L3 late | still L2 @17.3k |

E18S9 **this seed** hit L3 **14261** after 2+2. E11S6 climbed. **Only E18S5 stayed thin.** Twin **E6S1** (no dest-cheap) **e3=16720**. leftover-5 **HOLD** all cand. L2 roads **0**. Not a pave bug.

## Verdict

- **WATCHING.** No KEEP / SEND BACK / seed.
- dest-21 dest-cheap **not** eating 5W while leftover 2W lives.
- dest-22 `=== 0` **would not** have helped this snapshot. Still the right dest-22 knob for the **1W-eat** window (critic pick A). Do not ship mid-race.
- Re-probe if needed: `rooms.objects` E18S5 creeps + spawn energy; redis `memory:pacifist1` `rooms.E18S5.spawn_list` / `energyAvailable` / `fiveWQueued` / `lastSpawn`.
- Mark **29029** / this-ctrl **29053**.

Did: last-fire miner table + lastSeen + dest-21 vs dest-22 gates. Did **not**: docker exec this write, push-race, seed, reset, git push, unclaim, SSH, src.
