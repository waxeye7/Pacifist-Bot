# Cycle-19 pave watch — 0 roads at RCL2

`run-2026-08-16T07-40-10Z` · `cycle-19-5w-only` · seed0 **4891503** · `--swap`.
mongo `rooms.objects` · redis **4928629** (elapsed **37126**/40000 · ~2.9k left).
Watch **40404** `race.mjs --watch --run run-2026-08-16T07-40-10Z --interval 15` — live, not restarted.

Gate is **L3 and slam-5** (`rcl===3 && cap>=550`). L4 **take-until-storage** (hold ext=5 until `storage.my`, then dump). L3 **must stay ext=5**. Janitor wipes leftover L2 road sites. 17 SEND-BACK was RCL2 pave.

Do not mid-race push. Mark: **29029** / this-ctrl **29694**. Never 24512. No KEEP.

## Now (mongo **4928617** · redis **4928629**)

| room | L / p | e3 / e4 | ext / cap | r / s | leftover-5 | miners | B |
| --- | --- | ---: | ---: | ---: | --- | --- | ---: |
| **E5S3** | **4** / **48254** | 15919 / **31759** | **5 / 550** | 43 / 9 | **HOLD** no stor · site 24310 | **5+5** | 3 |
| E12S3 | 3 / **107425** | 22664 / — | **5 / 550** | 50 / 0 | **HOLD** | **1+1** | 0 |
| **E18S9** | 3 / **12227** | 18487 / — | **5 / 550** | 52 / 0 | **HOLD** | **1+1** | 1 |
| **E11S6** | **4** / **11417** | 20994 / **35812** | **5 / 550** | 37 / 6 | **HOLD** no stor · site 3320 | **5+5** | 3 |
| E16S9 | 3 / **128609** | 17280 / — | **5 / 550** | 41 / 0 | **HOLD** | **5+5** | 0 |
| **E18S5** | **4** / **12301** | 17911 / **35279** | **5 / 550** | 43 / 6 | **HOLD** no stor · site 12685 | **5+5** | 3 |
| E12S1 | 3 / **105112** | 14703 / — | **5 / 550** | 39 / 0 | **HOLD** | **5+5** | 0 |
| **E13S7** | **4** / **66279** | 9607 / **31638** | **7 / 650** | 21 / 6 | **DUMP** stor.my 350e · +13 ext sites | **5+5** | 2 |

**4/8 L4 · 4/8 L3 · 0 L2 · 0 walls.** L3 **4/4 ext=5 HOLD · 0 ext sites.** L4 no-stor **3/3 ext=5 HOLD** (E5S3 / E11S6 / E18S5). L4 +`storage.my` **E13S7 DUMP** (cargo).
L2 **0/0** roads vacuously. L3 pave **spent** (0 road sites). L4 hub-ring sites **6–9** + storage/rampart. Builders suicide=false. 0 **4W**.

Lead L4 first: E13S7 **31638** then E5S3 **31759** · E18S5 **35279** · E11S6 **35812**.
Next L4: E16S9 need **6391** · E12S1 **29888** · E12S3 **27575** frozen · **E18S9 need 122773**.
Ctrl **8/8 L4** (E6S1 e4 **36483** last).

Ledger RCL2 **1264** vs **1615** (−351) 8/8.
RCL3 **17196** 8/8 vs **16566** 8/8 (**+630**). vs leftover-5 11000 **+6196**.
RCL4 **33622 4/8** vs **31044 8/8**. vs mark 29029 **not 8/8**. **CENSOR path.** No KEEP.

## L2 — **0 / 0**

No L2 rooms. Fail would be any standing road or road site at L2 (the 17 leak). Closed this seed.

## L3 leftover-5 — **must stay 5**

| room | ext / sites | p | note |
| --- | ---: | ---: | --- |
| E12S3 | **5 / 0** | 107425 | **HOLD** · dest **1W+1W** · p +58 in ~1.1k t |
| **E18S9** | **5 / 0** | **12227** | **HOLD** · dest **1W+1W** · ~0.66 e/t since e3 |
| E16S9 | **5 / 0** | 128609 | **HOLD** · 5+5 · likely L4 |
| E12S1 | **5 / 0** | 105112 | **HOLD** · 5+5 · dropE 6584 |

0 L3 ext leak. 0 L3 ext sites. 0 L3 ramps/walls.

## L4 take-until-storage cargo

| room | ext / sites | stor | ring r-sites | ramps | note |
| --- | ---: | --- | ---: | ---: | --- |
| E5S3 | **5 / 0** | site **24310**/30k | 9 | 8 | **HOLD** until stor |
| E11S6 | **5 / 0** | site **3320**/30k | 6 | 4+9s | **HOLD** until stor |
| E18S5 | **5 / 0** | site **12685**/30k | 6 | 7+10s | **HOLD** until stor |
| **E13S7** | **7 / 13** | **my** 15,13 **350e** | 6 | 36+1s | **DUMP** after stor.my |

Fail would be L4 ext>5 **before** `storage.my`. Did not: E5S3/E11S6/E18S5 still 5. Dump only after stor (E13S7).

## L3 pave cargo

| room | r / s | vs arterialN | note |
| --- | ---: | ---: | --- |
| E5S3 | 43 / 9 | 9 / plan 42 | spent · L4 ring sites |
| E12S3 | 50 / 0 | 9 / 58 | spent · overshot · **1W+1W** |
| E18S9 | 52 / 0 | 15 / 64 | spent · overshot · **1W+1W stall** |
| E11S6 | 37 / 6 | 12 / 68 | spent · L4 ring |
| E16S9 | 41 / 0 | 11 / 94 | spent · overshot |
| E18S5 | 43 / 6 | 11 / 60 | spent · L4 ring |
| E12S1 | 39 / 0 | 10 / 67 | spent · overshot |
| E13S7 | 21 / 6 | 9 / 73 | spent · L4 ring + dump |

Haul hub→spawn/ctrl/sources. **No** hub ring at L3. **No** wall/shell at L3. Open L3 roads **0**.
Overshot arterialN via walkLine recycle (same as c18). L4 ring is cargo.

## Miner WORK

| room | bodies | 5W |
| --- | --- | --- |
| E5S3 | 5W+5W | yes |
| **E12S3** | **1W+1W** | **no** (was 5W → 0 EM ~767 t → cheap) |
| **E18S9** | **1W+1W** | **no** (was 2W+1W) |
| E11S6 | 5W+5W | yes |
| E16S9 | 5W+5W | yes |
| E18S5 | 5W+5W | yes (was 5+2+2) |
| E12S1 | 5W+5W | yes |
| E13S7 | 5W+5W | yes |

0 **4W**. Dest cheap-miner `WORK<4` after 5W TTL. `fiveWQueued` **true** 16/16 blocks replace. `overlap4WQueued` room-flag stale on E11S6/E18S5 (src-level false).

## Checklist

| want | film **4928617** |
| --- | --- |
| L2 0/0 roads | **pass** (0 L2) |
| slam-5 ext=5 | **pass** L3 4/4 |
| leftover-5 hold L3 | **pass** all L3 **5 / 550** · 0 ext sites |
| L4 take-until-storage | **pass** no-stor **5** · E13S7 dump after stor.my |
| sites after slam-5, **≤8** open (L3) | **pass** L3 open **0–1** (E18S9 box) |
| haul line, not wall/shell/ring at L3 | **pass** · 0 L3 walls/ramps |
| 2 builders, no suicide | L3 **0–1** (spent) · L4 **2–3** · suicide=false |
| 5W after slam-550 | live **6/8** · **E18S9 / E12S3 1W** |

Fail watch: **E18S9 p=12227 / 1W+1W stall** · E12S3 dest 1W+1W · E13S7 dump **after** stor (ok).

**8/8 RCL4 impossible.** E18S9 need 123k / ~2.9k left. E12S3 crawl. Maybe E16S9 L4. **CENSOR.** No KEEP.

## Earlier (mongo + redis **4918284**)

| room | L / p | e3 | ext / cap | roads / sites | leftover-5 | miners | B |
| --- | --- | ---: | ---: | ---: | --- | --- | ---: |
| E5S3 | 3 / 95012 | 15919 | 5 / 550 | 43 / 0 | HOLD | 5+5 | 0 |
| E12S3 | 3 / 38836 | 22664 | 5 / 550 | 13 / 8 | HOLD | 5+5 | 2 |
| E18S9 | 3 / 7322 | 18487 | 5 / 550 | 19 / 7 | HOLD | 2+2 | 2 |
| E11S6 | 3 / 41418 | 20994 | 5 / 550 | 37 / 0 | HOLD | 5+5 | 0 |
| E16S9 | 3 / 18474 | 17280 | 5 / 550 | 15 / 8 | HOLD | 2+2 | 2 |
| E18S5 | 3 / 68542 | 17911 | 5 / 550 | 43 / 0 | HOLD | 5+5 | 0 |
| E12S1 | 3 / 38710 | 14703 | 5 / 550 | 39 / 0 | HOLD | 5+5 | 0 |
| E13S7 | 3 / 69923 | 9607 | 5 / 550 | 15 / 0 | HOLD | 5+5 | 0 |

8/8 L3 · 8/8 ext=5 HOLD · 0 L4. Ctrl already 2/8 L4 (E21S4 23039 · E4S7 24100).

## Earlier (mongo / redis **4907017**)

| room | L / p | ext | roads / sites | miners |
| --- | ---: | ---: | ---: | --- |
| E5S3 | 2 / 43126 | 5 | **0 / 0** | 5+5 |
| E12S3 | 2 / 15797 | 5 | **0 / 0** | 2+1+2 |
| E18S9 | 2 / 21366 | 5 | **0 / 0** | 5+5 |
| E11S6 | 2 / 8221 | 5 | **0 / 0** | 1+2 |
| E16S9 | 2 / 33488 | 5 | **0 / 0** | 2+2 |
| E18S5 | 2 / 30341 | 5 | **0 / 0** | 2+5 |
| E12S1 | 3 / 5402 | 5 | 0 / 8 | 5+5 |
| E13S7 | 3 / 2372 | 5 | 3 / 8 | **1+1** |

L2 **0/0**. First L3 E13S7 **9607** then E12S1 **14703**.

## Earlier (L2 only, redis **4894937**)

8/8 L2 · 0/0 roads · slam 0–2 ext · miners still 2W. Lead p E16S9 5033.

Did: mongo + redis. Did **not**: push-race, reset, git push, unclaim, SSH, seed, src, push-pacifist. Watch 40404 left running.
