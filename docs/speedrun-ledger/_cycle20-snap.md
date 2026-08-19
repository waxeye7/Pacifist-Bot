# Cycle-20 snap

`run-2026-08-16T08-58-29Z` · `cycle-20-5w-only` · isolated 5W rematch vs `e839fc8`.
Dest: 5W clamp+HOL + cheap-miner **WORK<2** + leftover-5 + no RCL3 pave + no far-ctrl.
Cargo still in dest: miner-first, L4 strip. **5W process-pass last fire** (film D 7/8; E18S9 dest-cheap 1+1 then 5+5). Not a clock KEEP.
Mark **29029 8/8**. This-control **31044**. Not dirty **24512**.
tick **4966833** · elapsed **34542 / 40000** (seed0 4932291) · lastSeen **4968407** · seed **16/16 seedOk**. exitReason **null**. watch **19568**.

Prev: cycle-19 FINAL tick-budget **4931580**. cand 1264 / 17196 / **34358 5/8** · ctrl 1615 / 16566 / **31044 8/8**. **CENSOR 5/8. 5W dest DIRTY WORK<4. No KEEP.** 19 FINAL stands.

## Race-mean

```
candidate  RCL2 1320 (n=8/8)  RCL3 18299 (n=8/8)  RCL4 29618 (n=1/8)  tick=4966833
control    RCL2 1500 (n=8/8)  RCL3 15419 (n=8/8)  RCL4 29053 (n=8/8)  tick=4966833
```

RCL2 **1320** vs **1500** (**−180**). RCL3 **18299 8/8** vs **15419 8/8** (**+2880**, cand slower). RCL4 **29618 1/8** (E13S7 **29618**) vs **29053 8/8**.
vs-clean29029: 1-room 29618 is not a mean. **not 8/8**, no KEEP.
−180 is **not** 5W. vs c19 RCL2 **−351** (1264 / 1615).

First cand L3: **E13S7 10503**/5 · E5S3 **15663** · E12S1 **15865** · E16S9 **16353** · E12S3 **18920** · E18S5 **19906** · E11S6 **22907** · **E18S9 26274**. leftover-5 **HOLD** L3 ext=**5**. Slam-5 **8/8**.
First cand L4: **E13S7 29618**. Climb **19115** vs c19 **22031** vs c18 **10766**.
First ctrl L3: **E21S4 11979**/10 leak · E3S5 **14282** · E4S7 **15413** · E9S1 **15697** · E8S5 **15714** · E8S3 **16316** · E6S1 **16392** · E13S9 **17559**.
First ctrl L4: **E21S4 23625** · **E4S7 24753** · E9S1 **27096** · E6S1 **30093** · E8S3 **30126** · E8S5 **31985** · E3S5 **32371** · E13S9 **32374**.

After 4966833 (JSON later): cand **E12S3 34555** @4966953 → RCL4 **32087 2/8**. Then **E16S9 35830** @4968407 → **33334 3/8**.

## Pair table (lastSeen ≤ 4968407)

| pair | cand | L/p/ext · e2/e3/e4 | ctrl | L/p/ext · e2/e3/e4 |
| --- | --- | --- | --- | --- |
| B1 hard | E5S3 | **3**/77855/**5** · 1128 / **15663** | E9S1 | **4**/140816/**20** · 1162 / 15697 / **27096** |
| B2 hard | E12S3 | **4**/11979/**5** · 1415 / 18920 / **34555** | E13S9 | **4**/51206/**15** · 1522 / 17559 / **32374** |
| B3 hard | E18S9 | **3**/66523/**5** · 1821 / **26274** | E8S5 | **4**/75641/**12** · 1683 / 15714 / **31985** |
| B4 med | E11S6 | **3**/77797/**5** · 1296 / **22907** | E8S3 | **4**/83215/**9** · 1472 / 16316 / **30126** |
| B5 med | E16S9 | **4**/575/**5** · 1236 / 16353 / **35830** | E4S7 | **4**/167398/**20** · 1522 / 15413 / **24753** |
| B6 med | E18S5 | **3**/74139/**5** · 1183 / **19906** | E6S1 | **4**/67604/**17** · 1522 / 16392 / **30093** |
| B7 easy | E12S1 | **3**/90453/**5** · 955 / **15865** | E3S5 | **4**/46647/**14** · 1449 / 14282 / **32371** |
| B8 easy | E13S7 | **4**/28907/**20** · 1522 / 10503 / **29618** | E21S4 | **4**/172774/**20** · 1671 / 11979 / **23625** |

All `seedOk=true`. leftover-5 **HOLD** cand L3 ext=**5**. Slam-5 **8/8**. L4 dump E13S7 **20** · E12S3 / E16S9 still **5** (dest take-until-storage). Ctrl leak **9–20**.
5W process-pass last fire (film D **7/8** live 5W · **E18S9** dest-cheap then **5+5**). L2 **0/0** · L3 **0/0** (`paveNow` gone). Not a clock KEEP.

## Near

Cand next L4: **E12S1 p=90453**/5 need **44547**. Then E5S3 77855 need 57145 · E11S6 77797 need 57203 · E18S5 74139 need 60861 · **E18S9 66523** need **68477**.
Ctrl 8/8 RCL4. Clock stops at 4.
~5.5k ticks left (34542/40000). lastSeen elapsed **36116** (~3.9k). E18S9 need **68477** — will not 8/8.

## Verdict — **WATCHING · will CENSOR**

- Still live (`exitReason` null, elapsed 34542 < 40000). No FINAL.
- **CENSOR.** 8/8 RCL4 impossible. No KEEP / REVERT / SEND BACK. 5W process-pass is not a clock KEEP.
- Beat **29029 8/8** or this-control **31044**. Not 24512. Do not Δ 29618 1/8.
- Cycle-19 FINAL **stands** — **CENSOR 5/8**, not KEEP. 5W dest-19 was WORK<4.
- leftover-5 **HOLD** L3 ext=5. E18S9 L3 **26274** late.
- Do **not** seed-21 until FINAL. 21 waits.

Did: race-mean + pair table. Did **not**: push-race, seed, reset, revert, unclaim, SSH, src.

```
NEVER  seed
NEVER  npm run push-race
NEVER  server:local:reset
NEVER  git push
NEVER  unclaim
NEVER  SSH
NEVER  src
```

---

Earlier (09:45Z): tick **4957948** · elapsed **25657 / 40000**. lastSeen **4958445**.

```
candidate  RCL2 1320 (n=8/8)  RCL3 17160 (n=7/8)  RCL4 — (n=0/8)  tick=4957948
control    RCL2 1500 (n=8/8)  RCL3 15419 (n=8/8)  RCL4 24189 (n=2/8)  tick=4957948
```

RCL2 **1320** vs **1500** (**−180**). RCL3 **17160 7/8** vs **15419 8/8** (**+1741**, not 8/8 — do not KEEP). RCL4 — vs **24189 2/8** (E21S4 **23625** · E4S7 **24753**).
vs-clean29029: no cand RCL4. **not 8/8**, no KEEP.
−180 is **not** 5W. vs c19 RCL2 **−351** (1264 / 1615).

First cand L3: **E13S7 10503**/5 · E5S3 **15663** · E12S1 **15865** · E16S9 **16353** · E12S3 **18920** · E18S5 **19906** · E11S6 **22907**. leftover-5 **HOLD** cand ext=**5**. Slam-5 **8/8**.
First ctrl L3: **E21S4 11979**/10 leak · E3S5 **14282** · E4S7 **15413** · E9S1 **15697** · E8S5 **15714** · E8S3 **16316** · E6S1 **16392** · E13S9 **17559**.
First ctrl L4: **E21S4 23625** · **E4S7 24753**.

After 4957948 (JSON later): cand **E18S9 26274** @4958565 → RCL3 **18299 8/8** (**+2880** vs 15419). Ctrl **E9S1 27096** @4959400 → RCL4 **25158 3/8**.

## Pair table (lastSeen ≤ 4958445)

| pair | cand | L/p/ext · e2/e3 | ctrl | L/p/ext · e2/e3/e4 |
| --- | --- | --- | --- | --- |
| B1 hard | E5S3 | **3**/39163/**5** · 1128 / **15663** | E9S1 | **3**/120133/**10** · 1162 / **15697** |
| B2 hard | E12S3 | **3**/53898/**5** · 1415 / **18920** | E13S9 | **3**/66876/**10** · 1522 / **17559** |
| B3 hard | E18S9 | 2/**44721**/**5** · 1821 | E8S5 | **3**/91257/**10** · 1683 / **15714** |
| B4 med | E11S6 | **3**/17938/**5** · 1296 / **22907** | E8S3 | **3**/87786/**10** · 1472 / **16316** |
| B5 med | E16S9 | **3**/68219/**5** · 1236 / **16353** | E4S7 | **4**/24390/**10** · 1522 / 15413 / **24753** |
| B6 med | E18S5 | **3**/25824/**5** · 1183 / **19906** | E6S1 | **3**/90483/**10** · 1522 / **16392** |
| B7 easy | E12S1 | **3**/45042/**5** · 955 / **15865** | E3S5 | **3**/80528/**10** · 1449 / **14282** |
| B8 easy | E13S7 | **3**/111016/**5** · 1522 / **10503** | E21S4 | **4**/45050/**15** · 1671 / 11979 / **23625** |

All `seedOk=true`. leftover-5 **HOLD** cand L3 ext=**5**. Slam-5 **8/8**. Ctrl leak **10** remaining L3 · L4 dump E21S4 **15** · E4S7 still **10**.
Stamp 4957948: **E18S9 still L2 p=39847**/5 · **E13S7 p=107500**/5. lastSeen E18S9 **44721** (still L2).
5W process-pass last fire (film D **7/8** live 5W · **E18S9 FAIL** 1+1 dest-cheap after TTL). L2 **0/0** · L3 **0/0** (`paveNow` gone). Not a clock KEEP.

---

Earlier (09:25Z): tick **4948284** · elapsed **15993 / 40000**. lastSeen **4950226**.

```
candidate  RCL2 1320 (n=8/8)  RCL3 13083 (n=2/8)  RCL4 — (n=0/8)  tick=4948284
control    RCL2 1500 (n=8/8)  RCL3 14617 (n=5/8)  RCL4 — (n=0/8)  tick=4948284
```

RCL2 **1320** vs **1500** (**−180**). RCL3 **13083 2/8** vs **14617 5/8** (not 8/8 — do not Δ). RCL4 —.
vs-clean29029: no cand RCL4. **not 8/8**, no KEEP.
−180 is **not** 5W. vs c19 RCL2 **−351** (1264 / 1615).

First cand L3: **E13S7 10503**/5 then **E5S3 15663**/5 HOLD. First ctrl L3: **E21S4 11979**/10 leak · E3S5 **14282** · E4S7 **15413** · E9S1 **15697** · E8S5 **15714**.
leftover-5 **HOLD** cand ext=**5**. Slam-5 **8/8**.

After 4948284 (lastSeen **4950226**): cand **14596 4/8** — E12S1 **15865** @4948557 · E16S9 **16353** @4948930. Ctrl **15419 8/8** — E6S1 **16392** @4948683 · E8S3 **16316** @4948806 · E13S9 **17559** @4949850.

## Pair table (lastSeen ≤ 4950226)

| pair | cand | L/p/ext · e2/e3 | ctrl | L/p/ext · e2/e3 |
| --- | --- | --- | --- | --- |
| B1 hard | E5S3 | **3**/8322/**5** · 1128 / **15663** | E9S1 | **3**/19999/**7** · 1162 / **15697** |
| B2 hard | E12S3 | 2/40048/**5** · 1415 | E13S9 | **3**/735/**5** · 1522 / **17559** |
| B3 hard | E18S9 | 2/11606/**5** thin · 1821 | E8S5 | **3**/12271/**10** · 1683 / **15714** |
| B4 med | E11S6 | 2/9565/**5** thin · 1296 | E8S3 | **3**/8390/**6** · 1472 / **16316** |
| B5 med | E16S9 | **3**/9043/**5** · 1236 / **16353** | E4S7 | **3**/15486/**10** · 1522 / **15413** |
| B6 med | E18S5 | 2/31880/**5** · 1183 | E6S1 | **3**/12886/**10** · 1522 / **16392** |
| B7 easy | E12S1 | **3**/6351/**5** · 955 / **15865** | E3S5 | **3**/18415/**10** · 1449 / **14282** |
| B8 easy | E13S7 | **3**/53146/**5** · 1522 / **10503** | E21S4 | **3**/58784/**10** · 1671 / **11979** |

All `seedOk=true`. leftover-5 **HOLD** cand L3 ext=**5**. Slam-5 **8/8**. Ctrl leak **10** E21S4 / E3S5 / E4S7 / E8S5 / E6S1 · E9S1 **7** · E8S3 **6** · E13S9 **5**.
Thin at 4948284: cand **E11S6 p=9081**/5 · **E18S9 p=10982**/5 (lastSeen 9565 / 11606, still thin).
5W process **PASS** 6/8 slam-550 `2×5W` (E5S3 · E13S7 · E12S3 · E16S9 · E18S5 · E12S1). **E11S6 2×1W** · **E18S9 1×2W**. L2 **0/0** · L3 **0/0** (`paveNow` gone).

---

Earlier (09:00Z): tick **4935803** · elapsed **3512 / 40000**. lastSeen **4936375**.

```
candidate  RCL2 1320 (n=8/8)  RCL3 — (n=0/8)  RCL4 — (n=0/8)  tick=4935803
control    RCL2 1500 (n=8/8)  RCL3 — (n=0/8)  RCL4 — (n=0/8)  tick=4935803
```

RCL2 **1320** vs **1500** (**−180**). RCL3 — · RCL4 —. vs-clean29029: no cand RCL4. **not 8/8**, no KEEP.
−180 is **not** 5W (fires at leftover-5 550). vs c19 RCL2 **−351** (1264 / 1615).

All L2. Slam **0–3** ext. leftover-5 **inert**. Ctrl E21S4 **4** (e839fc8).

## Pair table (lastSeen ≤ 4936375)

| pair | cand | L/p/ext · e2 | ctrl | L/p/ext · e2 |
| --- | --- | --- | --- | --- |
| B1 hard | E5S3 | 2/5814/**0** · 1128 | E9S1 | 2/4892/**2** · 1162 |
| B2 hard | E12S3 | 2/3775/**1** · 1415 | E13S9 | 2/7867/**1** · 1522 |
| B3 hard | E18S9 | 2/3574/**0** · 1821 | E8S5 | 2/4082/**0** · 1683 |
| B4 med | E11S6 | 2/3928/**2** · 1296 | E8S3 | 2/3852/**2** · 1472 |
| B5 med | E16S9 | 2/5525/**0** · 1236 | E4S7 | 2/6255/**2** · 1522 |
| B6 med | E18S5 | 2/6104/**2** · 1183 | E6S1 | 2/3460/**0** · 1522 |
| B7 easy | E12S1 | 2/2951/**2** · 955 | E3S5 | 2/3225/**1** · 1449 |
| B8 easy | E13S7 | 2/4407/**3** · 1522 | E21S4 | 2/4600/**4** · 1671 |

All `seedOk=true`. leftover-5 **inert** (cand ext **0–3**, no 550). Slam-5 **0/8**. 5W dest waits leftover-5.

e2 Δ: B7 **−494** · B6 **−339** · B5 **−286** · B4 **−176** · B8 **−149** · B2 **−107** · B1 **−34** · B3 **+138** (only cand-slower).
