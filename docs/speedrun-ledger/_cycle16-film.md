# Cycle-16 process film — `cycle-16-5w-real`

`run-2026-08-16T03-18-19Z` · set `1f90aub` `--swap` · control frozen `e839fc8`.
mongo `local-screeps-server-mongo-1` + redis `memory:pacifist1`.
Film tick **4808427** (objects same tick; ledger lastSeen **4807590**).
Elapsed **38775 / 40000** (seed0 4769652). Cand **8/8 L3**, **7/8 L4**. Did not wipe/push/seed.

## WORK — **5W YES** (not 4) · flood **NO**

Home EnergyMiner after leftover 2W. Want **5W** and **1 / source** until 1500-gate replace.

| room | L | cap | /src | WORK | note |
| --- | ---: | ---: | --- | --- | --- |
| E5S3 | 4 | 550 | 1 / 1 | **5+5** | `[5W,M]` just re-hatched after TTL |
| E12S3 | 4 | 1250 | 1 / 1 | **6+6** | 6W after 550 |
| E18S9 | 4 | 600 | **1 / 2** | **5** | other src waiting fill 300 |
| E11S6 | 4 | 1300 | 1 / 1 | **6+6** | |
| E16S9 | 4 | 1300 | 1 / 1 | **6+6** | |
| E18S5 | 3 | 550 | 1 / 1 | **5+5** | recovered — see below |
| E12S1 | 4 | 1300 | 1 / 1 | **6+6** | extra 4W2M is remote in-room |
| E13S7 | 4 | 650 | 1 / 1 | **5+5** | |

No **4W1M** home hatch (0 objects). 4W2M are remotes only. No 10+ flood. Max home miners/source **1** (E18S5 was 2/src for ~200t while leftover 2W + 5W overlapped). `fiveWQueued` **true** 16/16 cand sources. `overlap4WQueued` false.

`clamped EnergyMiner from 550 to 450` **DEAD**: 0 docker logs, 0 `users.console` (cand), 0 Memory shrink. Live home bodies `[5W,M]=550` or `[6W,3M]=750`.

## leftover-5 — **HOLD** L3 · L4 dump **OK**

Want cand L3 **ext==5 / cap==550**. L4 dump OK.

| room | side | L | ext | cap | siteExt |
| --- | --- | ---: | ---: | ---: | ---: |
| E18S5 | cand | 3 | **5** | **550** | 0 |
| E5S3 | cand | 4 | 5 | 550 | 15 |
| E18S9 | cand | 4 | 6 | 600 | 14 |
| E13S7 | cand | 4 | 7 | 650 | 12 |
| E12S3 | cand | 4 | **19** | 1250 | 1 |
| E11S6 | cand | 4 | **20** | 1300 | 0 |
| E16S9 | cand | 4 | **20** | 1300 | 0 |
| E12S1 | cand | 4 | **20** | 1300 | 0 |

Only remaining cand L3 is E18S5 = 5. L4 dumped on the four high rooms. E5S3/E18S9/E13S7 still starting the ring.

## E18S5 — special (censors the 8th)

HOL-exempt `[5W,M]` 550 sat at empty fill → 0 miners → **downgrade L3→L1** (notif), then same hour **re-L2 / re-L3** (leftover progress). Not a 4W clamp.

Now: **L3** p=8938, ext **5**, fill 550, **5+5 WORK**, 1/src, `spawnStall=0`. Too late for RCL4 this seed (~38.8k). Do not read 16 mean as 8/8 5W.

## Verdict — **WATCHING**

| | |
| --- | --- |
| 5W hatch | **yes** |
| flood | **no** |
| leftover-5 L3 | **hold** (E18S5=5) |
| L4 dump | **ok** |

No KEEP / REVERT / re-baseline (pile vs `e839fc8`; not 8/8). Did **not**: push-race, seed, wipe, mid-race push, unclaim, SSH VPS.
