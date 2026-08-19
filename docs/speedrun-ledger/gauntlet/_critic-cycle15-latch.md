# Critic — cycle-15 5W-latch (hostile)

Independent of the implementers. Default **SEND BACK**. No `src` edit. Did not
`push-race`, reset, SSH, unclaim E36N57, overwrite planner hub, mid-race push,
or revert the live race.

Control is frozen `e839fc8` on `pacifist-race`. Set `1f90aub`, `--swap`, 8 pairs /
16 rooms. Metric that matters: mean spawn→RCL4, **8/8**, **clean world**. True
north is spawn→RCL8; delay is legal, skip-forever is not (`gauntlet/CRITIC.md`).

Race **not finished**. This is the *likely* call and what would flip it. Not a
final KEEP / REVERT.

Ledger: `run-2026-08-15T23-57-10Z` (`cycle-15-5w-latch`). JSON `updatedAt`
2026-08-16T01:08:47Z, lastSeen **4729696**, seed0 **4696947**, elapsed
**32749 / 40000**. Brief's ~29.8k / cand RCL4 28057 n=2/8 / ctrl 24913 n=4/8 is
stale — **trust the JSON**.

---

## Verdict (likely)

| item | clock KEEP? | policy KEEP? | why |
|---|---|---|---|
| 5W-latch as a **5W** KEEP | **no** | n/a | no 5W hatched. Clamp-4W. |
| extra **4W** miner as spawn→RCL4 | **likely SEND BACK** | no | RCL3 already worse; RCL4 cannot catch |
| `fiveWQueued` flood-stop | n/a | **yes, if poke stays** | 13/14 were 15 then 14 miners/source |
| leftover-5 **24512 7/8** as the mark | **THROW OUT** | hold is still live | dirt + 7/8. Honest clean is **29029** |
| leftover-5 hold (this film) | not on trial | **yes** | cand L3/L4 still 5 ext |

Do **not** KEEP if RCL3/RCL4 worse. RCL3 is already worse **8/8**. RCL4 is
worse on every legal comparison that is already locked. The remaining three
candidate rooms cannot close either hole.

---

## What this race actually is

Hypothesis was “one extra **5W** at 550.” Cycle-13 `lastSpawn=0` flooded
(15/source). Cycle-14 `WORK>=5` never tripped because
`clampSpawnListToCapacity` shrinks `[5W,M]=550` to `[4W,M]=450`
(`floor(550*0.85)=467`). Cycle-15 latched with `fiveWQueued`.

Film (`_cycle15-snap.md`, objects 4727010): **2 miners/room**, clamp-4W, no 5W,
`fiveWQueued` **16/16**. Latch held. Flood is dead. After the leftover 2W dies
the source sits at **8 e/t** for ~1500t. Slam-5 paid 15k for a 10 e/t rung the
clamp gives back.

On 1-seat sources the overlap poke is a **no-op** while the 2W sits
(`_next-5w-latch.md` §4). E18S9 — the tail that will own the mean — never ran
2W+4W on the same source (`_cycle15-e18s9.md`).

**This is a 4W-overlap A/B, not a 5W A/B.** Do not KEEP 15 as “one extra 5W.”

---

## Locked clocks (JSON)

```
candidate  RCL2 811 8/8   RCL3 15177 8/8   RCL4 30195 5/8
control    RCL2 907 8/8   RCL3 15134 8/8   RCL4 27475 7/8
```

| clock | cand | ctrl | Δ | vs leftover-5 | vs clean c8 |
|---|---:|---:|---:|---:|---:|
| RCL2 | **811** 8/8 | 907 8/8 | **−96** | +72 vs 739 | −127 vs 938 |
| RCL3 | **15177** 8/8 | 15134 8/8 | **+43** | **+4177** vs 11000 | **+1348** vs 13829 |
| RCL4 | **30195** 5/8 | **27475** 7/8 | +2720, **n mismatch** | all 5 finishers **> 24512** | all 5 finishers **> c8 same room** |

RCL2 is the only KEEP-shaped number. It is not the clock. RCL3 **+43** is
inside poll noise (uncertainty 67–172; `_clean-world.md` says ignore gaps
under ~200) **and** it is still “worse” under the rule *do not KEEP if
RCL3/RCL4 worse*. vs leftover-5 RCL3 **+4177** is not noise.

### Cand RCL4 hits

| room | c15 | pair ctrl | vs pair | c8 clean | vs c8 | c5 dirty |
|---|---:|---:|---:|---:|---:|---:|
| E13S7 | **26926** | E21S4 **22927** | **+3999** | 23470 | **+3456** | 23602 |
| E11S6 | **29188** | E8S3 **29950** | −762 | 27870 | **+1318** | 27599 |
| E18S5 | **30245** | E6S1 **30758** | −513 | 25981 | **+4264** | 22209 |
| E16S9 | **32248** | E4S7 **22403** | **+9845** | 25963 | **+6285** | 23643 |
| E12S1 | **32370** | E3S5 (still L3) | — | 29859 | **+2511** | 23287 |

Two pair wins (E11S6, E18S5). Easy room E13S7 is already **+3.5k vs the honest
leftover-5+6W clock** and **+4.0k vs its pair**. First cand 26926 is already
**+2414 vs 24512**. E16S9 **32248** is a 6k loss vs clean leftover-5+6W on the
*same room*.

Ctrl RCL4 7/8: E4S7 **22403**, E21S4 **22927**, E8S5 **26914**, E9S1 **27406**,
E8S3 **29950**, E6S1 **30758**, E13S9 **31964**. Mean **27475**. Only E3S5 left.

leftover-5 still holding: cand L3 **and** L4 lastSeen `ext=5` `cap=550`. Ctrl
L3 leak 10; post-up dump 11–20.

---

## 1. Can 15 ever KEEP vs leftover-5 **24512**?

**No. Not this race. Not a later 5W. The mark is a lie.**

`_clean-world.md`: cycle-5 `run-2026-08-15T12-13-10Z` was `--wipe` only.
`user: null` planner depots stayed. Far rooms parked 4W on tick 0 of RCL3
without paying 5k. E5S3 (the 7/8 miss) had leftover road on the spawn tile,
projected ~46k. Campaign law (`CONTROL.md` §4): different censoring counts →
means not comparable. **24512 7/8 vs any 8/8 is illegal.**

Of 30002 − 24512 = 5490: leftover objects **+3786**, drop E5S3 **+731**, later
knobs **+973**. ~4.5k is dirt + censor. Honest leftover-5+6W on a clean seed
is cycle-8 **`29029` 8/8** (`run-2026-08-15T16-59-09Z`). Clean cand RCL4 sits
in **29–32k**. `_SPEEDRUN-STATE.txt` and `_next-after-15.md` still calling
24512 the mark is the same lie as REPORT's “30.6k → 24.5k.”

Arithmetic on *this* JSON, even if you keep the dirty mark:

- Five cand rooms are already in. Mean of those five is **30195**. Every one
  is **> 24512**. Every one is **> its own cycle-8**.
- Remaining three (E5S3 / E12S3 / E18S9) are already at elapsed
  **32638–32722** with 16k–39k progress left.
- **8/8 floor if they finished this tick: 31127.** Already **+6615 vs 24512**.
  Already **+2098 vs 29029**.
- Realistic at 8–10 e/t: **~32.0–32.3k**. +7.5–8.2k vs 24512. +3.0–3.2k vs
  29029.

RCL3 is locked **+4177 vs leftover-5 11000**. Rule says do not KEEP if RCL3
worse. That comparison is already over.

A future clamp-skip “real 5W” race still must not be scored against 24512.
Compare to **29029** or the live control on that seed.

---

## 2. Can 15 ever KEEP vs *this* control once n=8/8?

**No. The remaining rooms cannot flip it.**

RCL3 **+43 8/8** is already worse (strict) / a wash (honest). Either way it
does not save RCL4.

Remaining cand need4 at lastSeen 4729696: E5S3 **15664**, E12S3 **16745**,
E18S9 **39480**. Projected own RCL4 at 8–10 e/t: **~34.3 / 34.4 / 36.6–37.6k**.
8/8 **~32.0–32.3k**.

Remaining ctrl: E3S5 need **31069** → own **~35.6–37.7k**. Control 8/8
**~28.5–28.8k** (7 already in at 27475; E13S9 landed **31964**).

Cand 8/8 floor **31127** already loses to a control 8/8 that lands under 31.1k,
which it will — seven rooms are already in at 27475.

To beat this control at 28.5k the remaining three would need to average
**25674**. They are already at **32.6k elapsed**. Closed.

Even the KEEP-path next knob cannot rescue this vs `e839fc8`. Clamp-skip
model vs latch-4W is **−150…−600** (`_next-5w-clamp.md`). 15 is heading
**+3.5–4.0k vs this control**. A full-model skip still loses by ~3k. The
extra miner — 4W or 5W — is not the RCL4 lever. The 135k is still 6×2W →
4×2W = **8 e/t**, designed **16**.

Do not KEEP on n-mismatch (5/8 vs 7/8). Do not KEEP if control E3S5 misses
40k and someone drops it — that is cycle-5's 7/8 trick again.

---

## 3. What would flip the likely SEND BACK

Write these down so a later fire cannot invent a KEEP.

| flip | required | live? |
|---|---|---|
| Remaining 3 finish below lastSeen elapsed | time travel (already **32.6k**) | **no** |
| 8/8 cand ≤ 29029 | remaining 3 average **≤ 27085** | **no** — already past |
| 8/8 cand ≤ this control ~28.5k | remaining 3 average **≤ 25674** | **no** — already past |
| Beat dirty 24512 honestly | illegal mark + floor already 31127 | **no** |
| KEEP on RCL2 −96 | owner changes the metric | not this critic |
| Control E3S5 misses 40k | then n-mismatch; still not KEEP | do not |

**Not a flip:** “lead rooms look close.” E13S7 26926 is the *easy* room and
it already lost its pair by 4k and c8 by 3.5k. **Not a flip:** E11S6 / E18S5
beat their pair mates. Pair wins on median rooms do not cancel E13S7 / E16S9 /
E18S9. **Not a flip:** RCL3 +43 is noise. The rule is still “do not KEEP if
RCL3/RCL4 worse,” and RCL4 is not noise.

If JSON later shows the last three already have RCL4 elapsed **under** the
floors above, re-read the ledger before calling. Do not call KEEP off a 5/8
mean.

Not REVERT-now: flood is dead, leftover-5 is holding, RCL2 is ahead, **32.7k /
40k** still in budget. Wait 8/8, then SEND BACK the speed claim.

---

## Future check (CRITIC.md)

| | Q1 still-build | Q2 dead-cap / steal | Q3 RCL8 no-rewrite | |
|---|---|---|---|---|
| extra 4W miner (this race) | yes — spawn only | **no** — 450e HOL unshift; 8 e/t after 2W dies; slam-5's 10 e/t given back | yes | **SEND BACK the clock** |
| KEEP 15 as “5W” | n/a | n/a | n/a | **lie — hatch is 4W** |
| `fiveWQueued` flag alone | n/a | n/a | n/a | flood-stop only |
| lastSpawn=0 poke | n/a | n/a | n/a | cycle-13 gun; drop with the extra if SEND BACK |
| treat 24512 as the mark | n/a | n/a | n/a | **SEND BACK the clock** |

---

## Next knob — one per future race

`_next-after-15.md` rank, conditioned on this call. Hygiene
(`_clean-world.md` / `_NEXT-RACE.md` §0) is a **gate**, not a knob. Do not
mid-race push. `_cycle16-hygiene.md` writes latch+clamp-skip as if 15 KEEP —
that is the **wrong** next race under the likely call.

| if 15 is… | next race | spec | model Δ | do not also |
|---|---|---|---|---|
| **SEND BACK** (likely) | **#2 overlap-replace 4W** (roster D) | `_next-rcl3-overlap.md` / `_next-rcl3-roster.md` D | **−200…−800** (tail **−1k**) | clamp-skip, sticky, amount:6, extras-only, recycle-walk |
| KEEP (would need the flip table) | **#1 5W clamp skip** | `_next-5w-clamp.md` | **−150…−600** vs latch-4W | `getBody`, 550 producer, drop `fiveWQueued` |

**Pick from the SEND BACK row.** Overlap-replace is the 135k sink (6×2W at
10–12 → 4×2W at 8 → trickle 4W, designed 16). That is the clock. Clamp-skip
is how you *finish* a 5W KEEP so later knobs measure 10 e/t — there is no 5W
KEEP here. Racing skip after a SEND BACK is doubling down on a 450–550e HOL
the mean already rejected.

If SEND BACK the extra miner: revert `lastSpawn=0` poke **and** the flag
together (or the poke is a loaded gun with no safety). Do not leave
`fiveWQueued` as cargo-cult. Do not revert leftover-5 / 6W / depot /
no-RCL3-roads.

Compare the next race to **29029 8/8** and the live `e839fc8` on that seed.
Never to 24512.

Not these: adopt-plans (you *pay* for tiles; 24512 was *unowned leftovers
already standing*); first-box min-chebyshev (needs pack); reopen
no-rcl2-boxes; haul-2; HOL; recycle; seed cycle-16 while 15 is watching.

---

## Did not

`push-race`. `server:local:reset`. git push. unclaim E36N57. VPS SSH.
Planner hub 98/88 r44. `src` edit. Mid-race push. Revert live race.
Re-baseline. Seed.

Wait RCL4 8/8. Then SEND BACK the 4W-overlap as a speed KEEP unless the flip
table fires. Next knob: overlap-replace on a **clean** seed vs **29029**.
