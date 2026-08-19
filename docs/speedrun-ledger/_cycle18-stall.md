# Cycle-18 stall — leftover-1W blocks dest cheap-miner

`run-2026-08-16T06-22-16Z` · `cycle-18-rcl3-haul` · seed0 **4850955**.
mongo `rooms.objects` + redis `memory:pacifist1` + `users.code`.
Film **4879128–4881704** · elapsed **~28.2–30.7k / 40000**. Watch **12880** (left running).
No `push-race`. No seed.

**Cause:** HOL-exempt `[5W,M]` sits at fill **54–481** (`-6`); leftover **1W/2W** still live so dest cheap-miner (`liveMiners===0`) does not fire; second source dark. Same shape as `_cycle17-l2-stall.md`. Not missing dest heal.

## Dest — cheap-miner **IS** in cand

Hypothesis “not in race dest (only vps+main)” **false**.

| user | branch | `users.code` ts | cheap-miner |
| --- | --- | --- | --- |
| **pacifist** (`pacifist1`) | main active | **2026-08-16T06:22:04Z** (seed-clean `push-pacifist`) | **yes** `liveMiners===0` → `[2W,M]`/`[W,M]` |
| pacifist-race | main | 2026-08-06T09:38:42Z (`e839fc8`) | **no** |

`seed-clean.mjs` pushes dest unless `--skip-push`. 18 seed wrote then-src, which already had the heal. Control dest has no heal. Heal still requires **0** live miners — leftover 1W is a blackout.

## Film table

`lastSpawn` = **queue stamp**, not hatch. `fiveWQueued` **true** both home src all 4. leftover-5 **HOLD** ext **5 / 550**, 0 ext sites.

| room | L / p | miners WORK | sit | fill | head | stall | lastSpawn age | lastUsed age |
| --- | --- | --- | --- | ---: | --- | --- | --- | --- |
| **E11S6** | 2 / **6861** frozen | **1W** | **spawn 26,20** not src | 54→237 | **5W 550** | 2–76 EM | 76 / 876 | **6576** |
| **E18S5** | 2 / 6029→**10458** | 1W/2W then **5+5+5** | 10,21 mining | 85→450 | 5W then hatched | 176–599 then 0 | 233 / 1441 | 235 |
| **E16S9** | 3 / **14551→14924** (~3.7k frozen) | **1W–2W** | 43,34 near src | 89–481 | **5W 550** | 0–380 EM | 397 / 466 | 399 |
| **E12S3** | 2 / 29285→**30270** | 1W@spawn then **5+5** | 36,10 mining | 300→397 | 5W then hatched | 5–670 then 0 | 79 / 779 | 2239 then hatch |

### E11S6 — still blackout

p **6861** all probes. DG L1 then re-L2 (notif). spawn 25,21 e=54–237. ext 5/0. src **46,3 + 30,21 both 3000**. 0 roads. Sites: box 25,20 4148/5000 + 15,24 0/5000.

Live miner `[W,M]` at **26,20** (spawn-adj), `sourceId` **30,21** (L=4) — **not walking**. 2×`[W,2C,2M]` builders on the spawn box. Head `[5W,M]` + 4C + 2W-up. Interleave age 14–265 spends the trickle. `lastTimeSpawnUsed` **4874103** (~6.5k stale). Cheap-heal cannot fire (`liveMiners=1`).

### E18S5 — unstuck this hour

Notif: L2 → **DG L1** → re-L2. Early film: 1–2 leftover W, 5W head, stall **444–599**, p **6029–7064**. Then **3×[5W,M]** hatched (`lastUsed` 4880444). Far src 9,21 drained to 130. p **10458**. leftover-5 still 5. Not RCL3 yet.

### E16S9 — L3 pave + same 550 hole

e3 **13439**. p stuck **14551** ≥1.5k then crawl to **14924**. 1W at 43,34 (near 44,33). Far 22,18 **3000**. Tower **0e**. Roads **16 / 8** sites (hub→ctrl then south). 2 builders. Head 5W + 4W-up. fill **89**. leftover-5 **HOLD**. Pave sites exist; 550-head starves spend.

### E12S3 — 1W parked, then 5W hatch

Early: **1W** at **34,20** (spawn 33,21), both src 3000, 0 roads, stall **670**, head 5W. User “5W sitting at spawn” was the **queued** body; live was leftover 1W. Later **5W at 36,10** (src 36,9 @670) + 5W walking 39,26. p **30270**. 0 roads (L2 — pave inert).

## Hypothesis

| claim | film |
| --- | --- |
| cheap-miner not in race dest | **no** — dest `pacifist` has it since seed 06:22Z |
| HOL-exempt `[5W,M]` + leftover 1W = 550 never fills | **yes** — heal gated on `liveMiners===0` |
| leftover-5 | **HOLD** 4/4 ext=5 |

E18S5 / E12S3 recovered only after leftover died or fill lucked 550. E11S6 / E16S9 still 1W + 5W head. Not KEEP / SEND BACK (pile). Same cycle-17 leftover-blocks-heal.

Did: mongo + redis + dest `users.code`. Did **not**: push-race, seed, reset, unclaim, SSH, watch restart, src edit.
