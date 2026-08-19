# Cycle-20 pave watch — L3 0/0 HOLD · E13S7 L4 DUMP after stor.my

`run-2026-08-16T08-58-29Z` · `cycle-20-5w-only` · seed0 **4932291** · `--swap`.
mongo `_film-c18-pave.js` · redis **4967554** (elapsed **35263**/40000 · ~4.7k left).
Watch **19568** `race.mjs --watch --run run-2026-08-16T08-58-29Z --interval 15` — live, not restarted.

Dest: leftover-5 + 5W clamp+HOL + cheap-miner **WORK<2** + no RCL2 roads + **no** RCL3 pave (`ROAD && rcl < 4`) + **no** far-ctrl RCL2 depot.
L4 cargo: take-until-storage (hold ext=5 until `storage.my`, then dump). L3 **must stay ext=5**.
19 cargo: `paveNow` sited haul at L3 (E13S7 2+8 · E12S1 0+8 then 15–52 standing). This seed is the rematch with pave **reverted**.

Do not mid-race push. Mark: **29029** / this-ctrl **31044**. Never 24512. No KEEP.

## Now (mongo film **4967554**)

| room | L / p | e3 / e4 | ext / cap | r / s | leftover-5 | miners | B |
| --- | --- | ---: | ---: | ---: | --- | --- | ---: |
| E5S3 | 3 / **74511** | 15663 / — | **5 / 550** | **0 / 0** | **HOLD** | **5+5** | 0 |
| **E12S3** | **4** / **760** | 18920 / **34555** | **5 / 550** | **0 / 6** | **HOLD** no stor | **5+5** | 3 |
| **E18S9** | 3 / **61026** | **26274** / — | **5 / 550** | **0 / 0** | **HOLD** | **5+5** | 1 |
| E11S6 | 3 / **73279** | 22907 / — | **5 / 550** | **0 / 0** | **HOLD** | **5+5** | 0 |
| E16S9 | 3 / **130217** | 16353 / — | **5 / 550** | **0 / 0** | **HOLD** | **5+5** | 2 |
| E18S5 | 3 / **70063** | 19906 / — | **5 / 550** | **0 / 0** | **HOLD** | **5+5** | 2 |
| E12S1 | 3 / **86321** | 15865 / — | **5 / 550** | **0 / 0** | **HOLD** | **5+5** | 0 |
| **E13S7** | **4** / **25551** | 10503 / **29618** | **15 / 1050** | **0 / 6** | **DUMP** stor.my 15,13 | **5+5W3M+4W** | 3 |

**2/8 L4 · 6/8 L3 · 0 L2 · 0 L3 walls.** L3 **6/6 0/0 roads · 0 haul sites · ext=5 HOLD · 0 ext sites.**
L4 no-stor **E12S3 HOLD ext=5** (hub-ring sites **6** + 6 ramparts). L4 +`storage.my` **E13S7 DUMP** (film ext=15 · lastSeen **19** · +5 ext sites · 37 ramps · ring sites 6).
L3 otherSites: E18S9 / E16S9 / E18S5 **2 src-seat boxes**. **No road among them.** Towers **up** all 8.
Builders suicide=false. 0 dest-cheap 1W/2W. E13S7 extra **4W2M** miner (L4 cargo, not dest-dirty).

Lead L4: E13S7 **29618** then E12S3 **34555**.
Next L4: E16S9 need **4783** then E12S1 **48679** · E5S3 **60489** · E11S6 **61721** · E18S5 **64937** · **E18S9 need 73974**.
Ctrl **8/8 L4** mean **29053** (E21S4 **23625** · E4S7 **24753** · E9S1 **27096** · E6S1 **30093** · E8S3 **30126** · E8S5 **31985** · E3S5 **32371** · E13S9 **32374**).

Ledger RCL2 **1320** vs **1500** (**−180**) 8/8. RCL3 **18299 8/8** vs ctrl **15419 8/8** (**+2880**). vs leftover-5 11000 **+7299**. vs c19 17196 8/8 **+1103**.
RCL4 **32087 2/8** vs ctrl **29053 8/8**. vs mark 29029 **not 8/8**. **CENSOR path.** No KEEP.

~4.7k left. E16S9 likely 3rd L4. E18S9 need **74k** — will not. **not 8/8.**

lastSeen **4968051**: E13S7 p=27479 ext=**19** · E12S3 p=3775 ext=**5** · E16S9 p=133561 · E18S9 p=63493 ext=5.

## L2 roads — **0 / 0** (vacuous)

No L2 rooms. Fail: any standing road or road site at L2 (the 17 leak). Closed this seed. Earlier L2 film **8/8 0/0**.

## L3 leftover-5 — **must stay 5**

| room | ext / sites | p | e3 | note |
| --- | ---: | ---: | ---: | --- |
| E16S9 | **5 / 0** | **130217** | 16353 | **HOLD** · tower up · 2 src-seat sites · next L4 |
| E12S1 | **5 / 0** | 86321 | 15865 | **HOLD** · tower up · 5+5 |
| E5S3 | **5 / 0** | 74511 | 15663 | **HOLD** · tower up · dropE 7639 |
| E11S6 | **5 / 0** | 73279 | 22907 | **HOLD** · tower up · 5+5 |
| E18S5 | **5 / 0** | 70063 | 19906 | **HOLD** · tower up · 2 src-seat sites |
| **E18S9** | **5 / 0** | **61026** | **26274** | **HOLD** · tower up · **5+5** · 2 src-seat sites |

0 L3 ext leak. 0 L3 ext sites. 0 L3 ramps/walls. 0 L3 storage.

## L4 take-until-storage cargo

| room | ext / sites | stor | ring r-sites | ramps | note |
| --- | ---: | --- | ---: | ---: | --- |
| **E12S3** | **5 / 0** | **none** · 0 sites | 6 | 3+6s | **HOLD** until stor |
| **E13S7** | **15 / 5** | **my** 15,13 **1778e** | 6 | 37 | **DUMP** after stor.my |

Fail would be L4 ext>5 **before** `storage.my`. Did not: E12S3 still 5. E13S7 dump only after stor (hub box 15,13 flipped to storage). lastSeen E13S7 ext=**19**.

## L3 pave — **0 / 0** (paveNow reverted)

Fail = L3 haul like cycle-19 cargo (E13S7 2+8 / E12S1 0+8 then 15–52 standing).

| room | r / s | vs c19 cargo | note |
| --- | ---: | --- | --- |
| E13S7 | **0 / 6** | was 2+8 → 15 / 0 | **pass** · L4 ring sites only |
| E5S3 | **0 / 0** | was 0+8 → 43 / 0 | **pass** |
| E12S1 | **0 / 0** | was 0+8 → 39 / 0 | **pass** |
| E16S9 | **0 / 0** | was 5+8 | **pass** |
| E12S3 | **0 / 6** | was 50 / 0 | **pass** · L4 ring sites only |
| E18S9 | **0 / 0** | was 52 / 0 | **pass** |
| E11S6 | **0 / 0** | was 37 / 6 | **pass** |
| E18S5 | **0 / 0** | was 43 / 6 | **pass** |

L3 **0** standing · **0** road sites. L4 ring is cargo (E13S7 / E12S3). L3 builders on **src seats**, not pavement.

## Far-ctrl depot — **none at L2** · L3 miss-guard **E12S3 only**

Gate off at L2: `siteLegacyControllerDepot` `level !== 3`. Fire = spawn Cheby **>10**.

| room | spawn→ctrl | fire | L | standing box | site | kind |
| --- | ---: | ---: | --- | --- | --- | --- |
| E5S3 | 13 | YES | 3 | 24,28 / 24,31 / 24,29 | — | bin/hub |
| E12S3 | 14 | YES | **4** | 31,22 / **18,30** | — | hub · **L3 ctrl depot** kept |
| E18S9 | 10 | no | 3 | 35,11 / 32,8 / 35,12 | 45,5 / 20,39 | bin/hub · **src seats** |
| E11S6 | 13 | YES | 3 | 25,19 / 22,23 / 25,20 | — | bin/hub |
| E16S9 | 7 | no | 3 | 35,27 / 37,31 / 35,28 | 43,34 / 22,17 | bin/hub · **src seats** |
| E18S5 | 27 | YES | 3 | 9,34 / 5,30 / 9,35 | 11,34 / 10,21 | bin/hub · **src seats** |
| E12S1 | 22 | YES | 3 | 27,14 / 26,18 / 27,15 | — | bin/hub |
| E13S7 | 10 | no | **4** | 15,14 / 22,12 | — | bin · hub **15,13 → storage** |

**1** container Cheby≤4 of ctrl: E12S3 **18,30** (L3 legacy depot, dest-allowed). Fail would be a depot on a fire room after slam-550 while still L2 — did not.

## Miner WORK — **8/8 2×5W**

| room | bodies | sit | 5W |
| --- | --- | --- | --- |
| E5S3 | **5+5** | 20,46 + 11,41 | **yes** |
| E12S3 | **5+5** | 36,10 + 47,33 | **yes** |
| **E18S9** | **5+5** | 20,39 + 45,5 | **yes** |
| E11S6 | **5+5** | 47,4 + 26,20 | **yes** |
| E16S9 | **5+5** | 36,30 walk + 22,29 walk | **yes** |
| E18S5 | **5+5** | 11,34 + 10,21 | **yes** |
| E12S1 | **5+5** | 36,26 + 28,11 | **yes** |
| E13S7 | **5+5W3M+4W** | 12,13 + 11,12 + 18,15 | **yes** · extra 4W L4 cargo |

0 dest-cheap 1W/2W. dest `WORK<2` did **not** rewrite live 5W. E13S7 **4W2M** is a third miner, not a dest rewrite of the 5W pair.

## Checklist

| want | film **4967554** |
| --- | --- |
| L2 0/0 roads | **pass** (0 L2 · earlier 8/8) |
| slam 0–5 ext | **pass** L3 none >5 |
| no far-ctrl depot at L2 | **pass** (0 L2) |
| leftover-5 hold L3 | **pass 6/6 ext=5 / 550** · 0 ext sites |
| L4 take-until-storage | **pass** E12S3 **5** · E13S7 dump after stor.my |
| 5W after slam-550 | **pass 8/8 2×5W** |
| no RCL3 pave | **pass** L3 **6/6 0/0** · 0 haul sites |

Fail watch: L3 roads like c19 · L3 ext>5. **Did not.** E13S7 ext=10+ **is** dump after stor — ok. E18S9 e3 **26274** last, p=61026, will DNF RCL4.

**8/8 RCL4 impossible.** E18S9 need 74k / ~4.7k left. Maybe E16S9 L4. **CENSOR.** No KEEP.

## Earlier (mongo / redis **4959373**)

| room | L / p | e2 / e3 | ext / cap | r / s | leftover-5 | miners | B |
| --- | --- | ---: | ---: | ---: | --- | --- | ---: |
| **E5S3** | **3** / **42863** | 1128 / **15663** | **5 / 550** | **0 / 0** | **HOLD** | **5+5** | 2 |
| **E12S3** | **3** / **61277** | 1415 / **18920** | **5 / 550** | **0 / 0** | **HOLD** | **5+5** | 0 |
| **E18S9** | **3** / **5355** | 1821 / **26274** | **5 / 550** | **0 / 0** | **HOLD** | **5+5** | 0 |
| **E11S6** | **3** / **23594** | 1296 / **22907** | **5 / 550** | **0 / 0** | **HOLD** | **5+5** | 2 |
| **E16S9** | **3** / **74965** | 1236 / **16353** | **5 / 550** | **0 / 0** | **HOLD** | **5+5** | 0 |
| **E18S5** | **3** / **30474** | 1183 / **19906** | **5 / 550** | **0 / 0** | **HOLD** | **5+5** | 0 |
| **E12S1** | **3** / **49659** | 955 / **15865** | **5 / 550** | **0 / 0** | **HOLD** | **5+5** | 2 |
| **E13S7** | **3** / **117514** | 1522 / **10503** | **5 / 550** | **0 / 0** | **HOLD** | **5+5** | 0 |

**8/8 L3 · 0 L4.** leftover-5 HOLD 8/8. L3 8/8 0/0. E13S7 need 17486 to L4.

## Earlier (mongo / redis **4948949**)

| room | L / p | e2 / e3 | ext / cap | r / s | leftover-5 | miners | B |
| --- | --- | ---: | ---: | ---: | --- | --- | ---: |
| **E5S3** | **3** / **4060** | 1128 / **15663** | **5 / 550** | **0 / 0** | **HOLD** | **5+5** | 1 |
| E12S3 | 2 / 34194 | 1415 / — | **5 / 550** | **0 / 0** | n/a L2 | 5 | 1 |
| E18S9 | 2 / 11269 | 1821 / — | **5 / 550** | **0 / 0** | n/a L2 | **2** | 0 |
| E11S6 | 2 / 9435 | 1296 / — | **5 / 550** | **0 / 0** | n/a L2 | **1+1** | 1 |
| **E16S9** | **3** / **1031** | 1236 / **16353** | **5 / 550** | **0 / 0** | **HOLD** | **5+5+5** | 2 |
| E18S5 | 2 / 24384 | 1183 / — | **5 / 550** | **0 / 0** | n/a L2 | **5+5** | 0 |
| **E12S1** | **3** / **1407** | 955 / **15865** | **5 / 550** | **0 / 0** | **HOLD** | **5+5** | 2 |
| **E13S7** | **3** / **44233** | 1522 / **10503** | **5 / 550** | **0 / 0** | **HOLD** | **5+5** | 0 |

**4/8 L3 · 4/8 L2.** L2 **4/4 0/0.** L3 **4/4 0/0.** leftover-5 **HOLD 4/4.** E18S9 leftover **2W** starved. E11S6 dest-cheap **1W+1W**.

## Earlier (mongo / redis **4937237**)

| room | L / p | e2 | ext / cap | r / s | slam | depot | Cheby | miners | B |
| --- | --- | ---: | ---: | ---: | --- | ---: | ---: | --- | ---: |
| E5S3 | 2 / **7300** | 1128 | 2 / 400 | **0 / 0** | 2+3s | **none** | **13** fire | 2+2+2+2 | 2 |
| E12S3 | 2 / 5035 | 1415 | 2 / 400 | **0 / 0** | 2+3s | **none** | **14** fire | 2+2 | 2 |
| E18S9 | 2 / 4690 | 1821 | 1 / 350 | **0 / 0** | 1+4s | **none** | 10 off | 2+2 | 1 |
| E11S6 | 2 / 4584 | 1296 | 3 / 450 | **0 / 0** | 3+2s | **none** | **13** fire | 2+2+2 | 2 |
| E16S9 | 2 / 6504 | 1236 | 1 / 350 | **0 / 0** | 1+4s | **none** | 7 off | 2+2+2 | 2 |
| **E18S5** | 2 / **7906** | 1183 | 3 / 450 | **0 / 0** | 3+2s | **none** | **27** fire | 2+2+2 | 2 |
| E12S1 | 2 / 3811 | **955** | 3 / 450 | **0 / 0** | 3+2s | **none** | **22** fire | 2+2+2+2 | 2 |
| E13S7 | 2 / 5243 | 1522 | **4 / 500** | **0 / 0** | 4+1s | **none** | 10 off | 2+2+2 | 2 |

**8/8 L2 · 0 L3.** L2 **8/8 0/0 roads.** leftover-5 n/a. Miners all **2W**.

## Earlier (mongo / redis **4936595**)

| room | L / p | ext / cap | r / s | miners |
| --- | --- | ---: | ---: | --- |
| E5S3 | 2 / 6223 | 1 / 350 | **0 / 0** | 2+2 |
| E12S3 | 2 / 4170 | 1 / 350 | **0 / 0** | 2+2+2 |
| E18S9 | 2 / 3978 | 0 / 300 | **0 / 0** | 2+2 |
| E11S6 | 2 / 4085 | 2 / 400 | **0 / 0** | 2+2 |
| E16S9 | 2 / 6002 | 1 / 350 | **0 / 0** | 2+2+2 |
| E18S5 | 2 / 6647 | 2 / 400 | **0 / 0** | 2+2+2 |
| E12S1 | 2 / 3134 | 3 / 450 | **0 / 0** | 2+2 |
| E13S7 | 2 / 4724 | 4 / 500 | **0 / 0** | 2+2+2 |

Same 0/0 · same 0 depot.

Did: mongo + redis. Did **not**: push-race, reset, git push, unclaim, SSH, seed, src, push-pacifist. Watch 19568 left running.
