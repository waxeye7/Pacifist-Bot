# Cycle-17 pave film — E12S3

`run-2026-08-16T04-56-08Z` · `cycle-17-rcl3-pave` · mongo `rooms.objects` + redis `memory:pacifist1`.
Ledger lastSeen **4834812**. mongo/gameTime **~4834848**. No `push-race`.

## E12S3 — **L3 / ext 5 / roads 12 / sites 0**

| | |
| --- | --- |
| L / p | **3** / 108282 (ledger 107738) |
| ext / cap | **5 / 550** leftover-5 **HOLD** · 0 ext sites |
| standing roads | **12** |
| road sites | **0** |
| tower / boxes | 1 (29,21 e=1000) · 5 (hub+bin+depot+2 src) |
| builders | **0** (Repair `[W,C,M]` only) |
| miners | **5W+5W** · `spawnStall=0` |

Standing: hub-ring **30,20 30,21 30,22 31,20 31,22 32,20 32,21 32,22** + haul **29,23 33,19 34,18 35,17**.
`arterialN=9` hub **31,21**. Ring batch done. Next 8 haul **not sited**. No wall/shell/rampart sites.

## Other cand (mongo ~4834848)

| room | L / p | ext / cap | roads / sites |
| --- | --- | --- | ---: |
| E5S3 | 2 / 7629 | 4 / 500 | **0 / 0** (not slam-5) |
| E18S5 | 2 / 9597 | **5 / 550** | 1 / 7 |
| E18S9 | 2 / 9683 | 5 / 550 | 1 / 8 |
| E11S6 | 2 / 10330 | 5 / 550 | 10 / 8 |
| E16S9 | 2 / 10645 | 5 / 550 | 23 / 2 |
| E12S1 | 2 / 14699 | 5 / 550 | 10 / 8 |
| E13S7 | 2 / 13839 | 5 / 550 | 17 / 0 |

L2 slam-5 is paving (hardened RCL2+, cap **≤8**). E5S3 inert. Was 2ext stall; now 4.

## Checklist (hardened: slam-5 RCL2+, max 8, 2 builders)

| want | film |
| --- | --- |
| sites after slam-5, **≤8** open | **pass** on L2 slam rooms · E12S3 **0** (batch done) |
| haul line, not wall/shell | **pass** — ring + 4 haul · no wall |
| 2 builders, no suicide | E12S3 **0 builders** after sites emptied |
| leftover-5 hold | **pass** — ext **5**, 0 ext sites |
| finish → next 8 of haul | **not yet** on E12S3 |

## Verdict — **WATCHING**

Pave spent. leftover-5 holds. Recycle of next haul batch not visible. No KEEP.

Did: mongo + redis. Did **not**: push-race, seed, reset, SSH VPS.

## BFS (second mid-race push)

`walkLine` died at E12S3 `29,23`: hub 31,21 and ctrl 19,27 are on **opposite sides of a wall**. Only walkable ctrl neighbor is 18,28. 8-dir BFS now goes south: `31,24…27,31` toward depot 18,30. After that push: E12S3 **13 roads + 8 haul sites**, 2 builders. All 8 slam-5 rooms have haul sites. leftover-5 still 5.
