# RCL2 ideas still unrun on clean leftover-5

Read-only rec. **No src. No seed.** Filter of `_rcl2-ideas.md` +
`_next-rcl2-sink.md` after leftover-5 KEEP. Cycle-15
(`run-2026-08-15T23-57-10Z`) is still watching — do not start one of
these until that run is called.

```
NEVER  npm run push-race
NEVER  server:local:reset
NEVER  unclaim E36N57
NEVER  seed while 15 is watching
```

Metric: mean ticks spawn→RCL4. One knob per race. Model Δ, not a race
number. Clean leftover-5+6W mark is cycle-8 **29029 8/8**, not dirty
24512 7/8 (`_clean-world.md`). First clean world is cycle-8.

Live stack these knobs sit on: slam-5, leftover-5 hold, `amount` 6
after 550, no RCL3 roads, no RCL2 source boxes, cycle-8 depot
miss-guard. Do **not** bundle leftover-5 / `maxSitesFor` / `RCL2_ORDER`.

---

## Already called — not still-open

| idea | where | call | on clean leftover-5? |
|---|---|---|---|
| Slam all 5 at RCL2 | `_rcl2-ideas` confirm | KEEP cycle-3 | n/a (pre leftover-5) |
| **B** / rank #2 — `amount` 6 after 550 only | sink B | **KEEP** cycle-4 | policy is on the leftover-5 stack from cycle-5 on. Do not re-A/B |
| Leftover-5 hold | ext policy | **KEEP** cycle-5 | dirty 24512; policy re-checked clean (cand L3 = 5 ext) |
| **A** / rank #1 — recycle `[W,C,M]` @ 550 (`recycle()` walk) | sink A | **SEND BACK** cycle-7 | **no** — dirty leftover-5+6W. Fail is the **walk** (1W leaves the controller; far rooms +4–7k RCL3). Clean would be worse (no leftover depot). Stay dead |
| Rank #3 harvest-to-spawn `[W,C,M]+[C,M]` | cycle-6, not the spec | **SEND BACK** | **no** — dirty 7/8. Wrong variant (see #3 below) |
| **D** / rank #5 — force `[5W,M]` `lastSpawn=0` @ 550 | sink D | c13 flood / c14 once / **c15 latch watching** | **yes** (c8+). Not unrun. Remaining hatch (4W vs 5W) is `_next-cycle16.md`, not this list |
| Stay `[W,C,M]` at 550 | `_rcl2-ideas` §4 | dead unless `amount` doubles | 6W already KEEP |
| Trickle 1–2 stay 2W | §1 | **KILL** | — |
| Container before last ext | §2 | **KILL** | live already ext-then-box; c10 then turned the box off |
| Revert builders 6/4/6 | §3 | **dead** | live roster is 2 |
| `[W,3C,M]` | §5 | noise ~0–50t | — |
| Container-first at RCL1 | §6 | illegal | — |
| **C** — hold RCL3 at 2 until depot | sink C | **inert on 6W** | unrun, do not spend. Six 450e already live → delta ≈ 0 |
| Split `findLocked` 2 sites | leftover | energy-same while income-bound | — |

Cycle-1 HOL+recycle as a **bundle** also SEND BACK. Do not restack A+C.

---

## Still unrun — ranked, one knob

Order is remaining model on **this** stack (leftover-5 + 6W + no RCL2
boxes + recycle off). Not the pre-cycle-4 order in `_rcl2-ideas`.

### 1. Shuttle gate 450 / 3 ext

**From** `_rcl2-ideas` leftover trickle / sink “later if A+B saturate.”
**Unrun.** A is dead; B KEEP — this is the only leftover “not all 5”
shape.

**One knob:** `shuttleUpgraderBody` flips `[2W,2C,2M]` at
`energyCapacityAvailable >= 450` (3 ext), not 550. **Leave** amount-6
at 550. **Leave** `[5W,M]` at 550. **Leave** slam-5 / leftover-5.
Do **not** recycle 200e. Do **not** stop at 3 ext.

Census still counts heads, not bodies — living 200e are not retired
(same no-op as crossing 550). Pays only as **replacements** that die
between ext 3 and 5, so late-slam / post-slam leftover 200e is shorter.
Original “unlocks 0.99 ~750t earlier” assumed the roster flips; it
does not.

**Model:** spawn→RCL2 ~0. RCL2→RCL3 **−0 to −400** if a 200e dies in
that window; ~0 if leftover TTL at 3-ext is still long. Smaller than
dead A. Delays 5W by the last 6k of ext (~750–1000t) only if you also
move the miner gate — **do not**.

Race only if film on a leftover-5 finisher shows 200e still on the
controller for ≥400t after cap 550.

### 2. Rank #4 — first box = min chebyshev / `si`

**From** `_rcl2-ideas` #4. **Unrun.** Cycle-10/11 were *when*, not
*which tile*.

**One knob:** among early source seats, take min chebyshev to `plan.si`
(storage if `si` missing). Prefix of **one**. Not two boxes at RCL2.
Not cycle-11 “2nd box at RCL4.”

**Gated.** Live race rooms are `planPackMiss` + BasePlan;
`plannedTilesFor` never runs (`_next-first-box.md`). Cycle-10 KEEP
also sites **no** source box at RCL2 on the legacy path. This knob is
inert until the 16-room v2 pack is adopted on **candidate only**
(`_next-adopt-plans.md`). Adopt is a different race. Do not bundle.

**Model:** 0 spawn→RCL2 / time-to-550. RCL2→RCL3 **−200 to −800** on
the 6/16 far-first rooms (E9S1, E13S9, E11S6, E4S7, E18S5, E16S9); ~0
else. Mean pulled by the hard split rooms.

### 3. Rank #3 — RCL1 one miner until a hauler **hatches**; drop T+100

**From** `_rcl2-ideas` #3 / `_next-rcl1-bootstrap.md`. **Unrun on
clean leftover-5.** Cycle-6 was harvest-to-spawn on dirty 24512, not
`hatchedHomeHauler` + no T+100. `_next-miner.md` already flags this.

**One knob:** cap≤300, `return` without unshift while a home miner is
live/queued and no in-room hauler has left the spawn; delete the
`lastSpawn = T-(1500-100)` re-arm. Do **not** pin nearest source. Do
**not** revert to `[2W,M]+[C,C,M]`. Do **not** recycle 200e.

**Model:** spawn→RCL2 **−50 to −200** near/split; **sign can flip (+)**
far-only (CARRY miner on the long tile cannot drop-mine). Read mean
**and** pair split. Already lost once on dirt; later notes say stay
dead. Rematch only as a clean 8/8, not next after latch.

### 4. Suicide-in-place the 200e @ 550 (not recycle-walk)

**From** sink A “different knob — do not swap mid-race.” **Unrun.**
Cycle-7 was `recycle()` to spawn.

**One knob:** the tick cap ≥550, 200e `[W,C,M]` `suicide()` on the
controller (no walk). Census already skips `memory.suicide`. Rewrite
200e `spawn_list` to 450e. **Keep `amount: 4` during slam; live after
550 is 6** — do not raise again. Do not touch 5W / RCL3 amount.

**Cost:** hole while 4–6×450e serialize (~27t + fill each). Lose the
refund. 6W hatch on top of the hole.

**Model:** maybe less bad than cycle-7’s −4.3k RCL3 (no far walk),
still a hole vs leaving 0.50 e/t until TTL. Last. Do not run on 15.
Do not restack with #1.

### 5. Builder 2 vs 1 at RCL2

**From** `_rcl2-ideas` §3 optional tiny A/B. **Unrun.** Live is 2
(`earlyBuildSlots`). Model already says 2 wins time-to-550 (15k ext
~2.5k vs ~5k).

**One knob:** `earlyBuildSlots` 2 → 1 on non-road sites at RCL2 only.
Do not revert to 4–6. Do not split `findLocked`.

Race **only** if slam-to-550 on a leftover-5 film is fat. Expected
**+** (1 is slower). Not a speed hunt.

### 6. RCL2 repairer at `progress > 4500` (no hit check)

**From** `_rcl2-ideas` leftover. **Unrun.** 200e idle until a container
exists; cycle-10 means that is usually **never** at RCL2.

**One knob:** do not queue that repairer unless a standing structure
is actually damaged. Fold into a spawn-HOL sweep, do not spend a race
on it alone. **−30 to −80**.

---

## Later RCL2 — not in those two notes

These are still unrun on clean leftover-5 and sit on the same clock.
Not a rewrite of `_rcl2-ideas`; listed so this rec does not pretend
the leftover trickle is the biggest remaining lever.

| # | knob | one change | model | spec |
|---|---|---|---|---|
| **F** | Far-ctrl depot @ RCL2 after slam-5 | `siteLegacyControllerDepot` also when `level===2 && spawn.getRangeTo(ctrl)>10 && cap>=550` | R2→3 **−1.5k…−2.5k** on the 10/16 that fire; R3→4 **−0.5k…−1.5k**; E13S7 / E18S9 = 0 | `_next-far-ctrl.md` / `_next-far-depot.md` |
| **G** | 5W clamp skip + HOL-600 skip | home `[5W,M]` hatches 5W at leftover-5 550 (latch extra is 4W today) | **−150…−600** vs latch-4W | `_next-cycle16.md` — after 15 is called |

**F** is the largest remaining RCL2-clock idea. Those two source notes
stated “no depot at RCL2” as *live*, not as a closed A/B. Do not
bundle F with #1/#2/#4. Cycle-10 KEEP was “no source/depot **during
slam** / no source boxes for everyone” — F is post-slam, depot only,
gated.

**G** is a follow-up to called D, not an unrun row from `_rcl2-ideas`.

---

## Do not spend a race on

- Reopening recycle-walk on clean leftover-5
- Reopening amount 4 vs 6
- Hold RCL3 at 2 (inert on 6W)
- Instant leftover-5 / trickle-ext / 6W miner
- RCL3 `amount` 6 after depot (parked 4W climb, `_next-rcl3-roster.md` E)
- Haul-2 / 2nd box @ RCL4 / 5W-once flood (SEND BACK, stay dead)
- Adopt + first-box in the same seed
- Anything while cycle-15 is live

---

## Order if this stack is next

Wait 15 RCL4 8/8. Hygiene (`_clean-world.md`) is a gate, not a knob.

1. **G** if 15 KEEP (or G without the poke if 15 SEND BACK) — so later
   income is measured at 10 e/t, not 8. Already queued as cycle-16.
2. **F** far-ctrl depot — biggest leftover RCL2 sink.
3. Adopt 16 (candidate only), then **#2** first-box.
4. **#1** shuttle gate only if film still shows long 200e leftover
   after G+F.
5. **#3** HOL rematch last among these, clean 8/8 only.
6. **#4 / #5 / #6** do not start a cycle.
