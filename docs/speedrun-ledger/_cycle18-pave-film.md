# Cycle-18 pave film — E16S9 + E13S7

`run-2026-08-16T06-22-16Z` · `cycle-18-rcl3-haul` · mongo `rooms.objects`.
seed0 **4850955** · redis **4885552** (elapsed **34597**/40000). Ledger lastSeen **4876360**. No `push-race`.

## Now (mongo / redis **4885552**)

| room | L / p | ext / cap | roads / sites | miners | B | leftover-5 |
| --- | --- | ---: | ---: | --- | ---: | --- |
| **E13S7** | **4** / 93588 | **20 / 1300** | **23 / 0** | 2×6W3M | 0 | **DUMP** |
| **E5S3** | **4** / 9365 | **6 / 600** | **43 / 0** | 2×5W | 3 | **DUMP** (+1 ext site) |
| E12S1 | 3 / 112916 | **5 / 550** | **39 / 0** | 2×5W | 0 | HOLD |
| E18S9 | 3 / 27647 | **5 / 550** | **40 / 7** | 2×5W | 2 | HOLD |
| E16S9 | 3 / **15115** stall | **5 / 550** | **29 / 8** | **1W** | 2 | HOLD |
| E12S3 | 3 / 5412 | **5 / 550** | **0 / 8** | 2×5W | 2 | HOLD |
| E18S5 | 2 / 41028 | 5 / 550 | **0 / 0** | 2×5W | 0 | n/a L2 |
| E11S6 | 2 / **7001** stall | 5 / 550 | **0 / 0** | **3×2W** | 2 | n/a L2 |

L2 **0/0** roads (c17 leak closed). L3 **ext=5 HOLD**. E13S7 L4 **DUMP** ext=20 (first L4 **23715**). E5S3 just L4, dump started. E16S9 p frozen **~15k** (1W). E11S6 stall (brief L1 bounce then L2 p~7k). No KEEP.

---

Earlier film (mongo ~**48766xx** / lastSeen **4876360**):

| room | L / p | ext / cap | roads / sites | miners | B | leftover-5 |
| --- | --- | ---: | ---: | --- | ---: | --- |
| **E13S7** | **4** / 25182 | **7 / 650** | **15 / 0** | 2×5W + 4×4W2M | 3 | **DUMP** (was 5) |
| E5S3 | 3 / 67634 | **5 / 550** | **43 / 0** | 2×5W | 0 | HOLD |
| E12S1 | 3 / 46466 | **5 / 550** | **39 / 0** | 2×5W | 0 | HOLD |
| E16S9 | 3 / **14626** stall | **5 / 550** | **5 / 8** | **1W** | 1 | HOLD |
| E12S3 | 2 / 29285 | 5 / 550 | **0 / 0** | 1×5W @spawn | 0 | n/a L2 |
| E18S9 | 2 / 12671 | 5 / 550 | **0 / 0** | 2W+5W | 0 | n/a L2 |
| E11S6 | 2 / **6861** stall | 5 / 550 | **0 / 0** | **0** | 0 | n/a L2 |
| E18S5 | 2 / **6029** stall | 5 / 550 | **0 / 0** | **1W** | 2 | n/a L2 |

L3 haul spent (E5S3/E12S1 overshot arterialN via walkLine recycle). E16S9 sited then starved (1W + HOL-exempt 5W not in race dest).

---

Earlier film (ledger lastSeen **4868573** / mongo **4868067**):

Both just L3 + slam-5 (`cap=550`). Seed0 4850955. E13S7 e3 **12949**. E16S9 e3 **13439**.

## E16S9 — **L3 / ext 5 / roads 0 / sites 8 / builders 1**

| | |
| --- | --- |
| L / p | **3** / **14551** (stuck ≥1500t; first film 4866558 already 14551) |
| ext / cap | **5 / 550** leftover-5 **HOLD** · 0 ext sites |
| standing roads | **0** |
| road sites | **8** (all p=0) · 5×300 + 3×1500 swamp |
| tower / boxes | site 39,31 **2025/5000** · 5 (hub+bin+depot+2 near-ctrl) |
| builders | **1** `[W,2C,2M]` e=75 suicide=false |
| miners | **1W** at 21,18 (far src) · 5W dead · stall **339** on next `[5W,M]` |

Hub **37,31** `arterialN=11`. Sites = walkLine hub→ctrl 42,22:
`37,30 37,29 38,28 39,27 40,26 40,25 40,24 41,23`.
No hub ring. No wall/shell/rampart. Source/spawn haul **not sited** (first 8 is ctrl only).
Builder priority is still **tower** (builder.ts), so 0 road energy spent.
Want 2 builders: spawn head is unaffordable 550 miner (fill 143). 2 upgraders queued behind it.

## E13S7 — **L3 / ext 5 / roads 15 / sites 0 / builders 0**

| | |
| --- | --- |
| L / p | **3** / 37933 (ledger 44089) |
| ext / cap | **5 / 550** leftover-5 **HOLD** · 0 ext sites |
| standing roads | **15** |
| road sites | **0** |
| tower / boxes | 1 (19,16 e=1000) · 5 (hub+bin+2 depot + spawn-adj) |
| builders | **0** (sites emptied; Repair `[W,C,M]` only) |
| miners | **5W+5W** · `spawnStall=0` |

Hub **17,16** `arterialN=9`. Standing:
`11,12 12,13 13,14 13,15 14,15 14,16 15,16 16,16 18,16 19,16 20,16 21,16 22,16 23,16 24,15`.
Haul hub→ctrl 25,14 + sources 10,13 / 12,14. No ring. No wall.

First film **4866558**: **6 roads + 7 sites**, **2** `[W,2C,2M]` suicide=false, two tiles already 120/300.
Then recycle (+`14,16 13,15`) and spend. 300e/tile paid. Builders stood down.

## Other cand (mongo 4868067)

| room | L / p | ext / cap | roads / sites | B |
| --- | --- | --- | ---: | ---: |
| **E5S3** | **3** / 2712 | **5 / 550** | **0 / 8** | **2** |
| E12S3 | 2 / 29075 | 5 / 550 | 0 / 0 | 0 |
| E18S9 | 2 / 11322 | 5 / 550 | 0 / 0 | 1 |
| E11S6 | 2 / 5079 | 5 / 550 | 0 / 0 | 2 |
| E18S5 | 2 / 6029 | 5 / 550 | 0 / 0 | 2 |
| E12S1 | 2 / 33084 | 5 / 550 | 0 / 0 | 0 |

L2 still **0 / 0** roads (c17 leak closed). E5S3 just L3+slam-5: 8 haul sites + 2 builders, same as the watch.

## Checklist (RCL3 + slam-5, max 8, 2 builders)

| want | film **4885552** |
| --- | --- |
| sites after slam-5, **≤8** open | **pass** E12S3 **8** · E16S9 **8** · E18S9 **7** |
| haul line, not wall/shell/ring | **pass** L3 · L4 E13S7/E5S3 now have ramps (dump/shell) |
| 2 builders, no suicide | L3 paving **2** · E16S9 now **2** (was 1) · suicide=false |
| leftover-5 hold | **pass** all L3 **5 / 550** · L4 DUMP E13S7=20 E5S3=6 |
| finish → next 8 of haul | E18S9 40/7 recycle · E16S9 29/8 · E12S1 39/0 done · E12S3 0/8 just open |

## Verdict — **WATCHING**

L2 **0/0**. L3 leftover-5 **HOLD**. E13S7 L4 **DUMP**. E16S9 **paving now** (29/8) but **p~15k** (1W). E11S6 **stall**. No KEEP.

Did: mongo + redis. Did **not**: push-race, seed, reset, SSH VPS, watch-12880.
