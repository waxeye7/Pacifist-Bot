# Next race — cycle-16 5W hatch

Read-only. **Do not seed now.** Cycle-15 (`run-2026-08-15T23-57-10Z`,
`cycle-15-5w-latch`) is still watching — RCL4 not 8/8
(`_cycle15-rcl4.md`). Wait KEEP/SEND BACK.

Metric: mean ticks spawn→RCL4. One knob. Set `1f90aub`. `--swap`.
Control frozen `e839fc8`. Leftover-5 stays on.

```
NEVER  npm run push-race
NEVER  server:local:reset
NEVER  git push
NEVER  unclaim E36N57
NEVER  seed while 15 is watching
```

`_next-seed.md` is not on disk. Seed is `tools/server/seed-clean.mjs`
(do not run it).

---

## Cycle-15 (not called)

`fiveWQueued` latch + `lastSpawn = 0` poke (`rooms.spawning.ts`
`:4266–4281`, write `:4361`). Hypothesis: one extra 5W at cap 550
while the leftover 2W still works.

| | |
|---|---|
| Latch | **held** — 2 miners/source, `fiveWQueued` 16/16, no 10+ flood |
| Hatch | **4W** — clamp `floor(550×0.85)=467` → `[4W,M]=450`; HOL `length*100=600` would drop WORK again after 40t `-6` |
| leftover-5 | **holding** — cand L3 5 ext / cap 550; ctrl leak 7–10 |
| RCL2 | 811 vs 907 (**−96**) 8/8 |
| RCL3 | 15177 vs 15134 (**+43**) 8/8 — wash vs this control; **+4177** vs dirty leftover-5 11000 |
| RCL4 | **0/16** — no KEEP / REVERT / re-baseline |

This race is a **4W-overlap** A/B, not a 5W A/B. Slam-5 paid 15k for a
10 e/t rung; after the 2W dies the source sits at **8 e/t**.

---

## Mark — 29029, not 24512

Honest clean leftover-5+6W clock is cycle-8 **29029 8/8**
(`run-2026-08-15T16-59-09Z`). Dirty cycle-5 **24512 7/8** is leftover
planner boxes + dropping E5S3 (`_clean-world.md`). Retired.

Clean-seed cand RCL4 sits **29–32k** (c8 29029, c9 30728, c10 30002,
c11 29819, c12 32303). Beat **29029** or this seed's live control.
Do not re-baseline on 7/8.

---

## Src now (dirty tree — not in the live 15 compile)

| | site | src |
|---|---|---|
| **clamp skip** | `rooms.spawning.ts` `:208–219` | `continue` on home `[5W,M]` cost **550** |
| **HOL exempt** | `:3029–3035` | EnergyMiner AND-not `[5W,M]` 550 (`length*100=600` does not shrink) |
| wait-for-600 | — | **absent** (correct — leftover-5 never fills 600) |
| latch poke | `:4281` | still `lastSpawn = 0` |
| `fiveWQueued` | `:4361` | still written on the home 550 path |
| sticky pickup | `creepFunctions.ts` `:1495`, `:1599–1702` | `STICKY_SOURCE_RANGE` / `atMine` **in tree** |
| leftover-5 | `PlanV2.ts` `extensionTake` `lvl<=3 → 5` | KEEP |
| 6W after 550 | `:879` `amount: cap>=550 ? 6 : 4` | KEEP |
| no RCL3 roads | `BasePlan.ts:489` `ROAD && rcl<4` | KEEP policy (BasePlan only) |
| no RCL2 source boxes | `construction.ts:1422/:1432` `level >= 3` | KEEP (hub+bin still slam) |

Spawn cost is **550**. HOL bar is 600. After both skips a leftover-5
room waits for `energyAvailable >= 550` and hatches **5W**. Neither
half works alone: clamp-only → HOL 4W after 40t; HOL-only → same-pass
clamp already made 4W.

Sticky is `_next-after-15.md` **#3**, not this knob. **Revert
`creepFunctions.ts` sticky before the seed** or 16 is a two-knob
bundle.

---

## Treatment — latch + clamp + HOL skip

**Race:** cycle-15 latch-4W vs latch + real 5W. Leftover-5 still on.
Compare the clock to **29029 8/8** and this seed's control. Not vs
cycle-13 flood. Not vs dirty 24512.

One knob = **both skips**. Already in src (`_next-5w-src.md`). Do not
touch `getBody`, the 550 producer, leftover-5, 6W `amount`, haul MAX,
roads, boxes.

| if 15 | poke `lastSpawn=0` | skip | what hatches |
|---|---|---|---|
| **KEEP** (no flood; call on RCL4 8/8) | **keep** | keep | overlap 5W while 2W lives, then 10 e/t |
| **SEND BACK** (flood, or lose RCL4) | **drop** (`:4281`) | keep | no poke. 1500-gate replacement is 5W, not 4W. `fiveWQueued` still writes so a later poke cannot flood |

Safer poke-free unshift (count `c.body` WORK, do not zero `lastSpawn`):
`_next-5w-latch.md` §safer. Only if 15 flooded. Do not re-ship
cycle-13/14. Do not add a max-2-miners cap in the same commit.

Model vs latch-4W (`_next-5w-clamp.md`): after leftover 2W dies,
**8 vs 10 e/t** × ~1500t ≈ 6k ≈ **375t** on the 135k. RCL2→3
**−100…−400**, RCL3→4 **−50…−200**. Mean **−150…−600**. Does not
raise the shuttle sink.

Src already has c9 no-roads / c10 no-RCL2-boxes. A 16 clock vs 29029
includes those (c10 was **+973** vs c8). Isolated twin is **15's
eventual RCL4**, once called.

---

## After 15 — hygiene, then this race

1. Call 15 (RCL4 8/8 or explicit censor). No mid-race push.
2. Revert sticky if it is still in `creepFunctions.ts`.
3. If SEND BACK: drop `:4281` `lastSpawn = 0`. Keep both skips.
4. **seed-clean** (gate, not a knob). `_clean-world.md`: user-null
   scrub, both racers' `Memory.rooms`, no stale `planV2` /
   `rclTimes.8`. `pacifist2` offline.
5. Seed cycle-16. Watch. Do not `--run` the live 15 id.

**Maybe adopt the 16-room v2 pack — later, candidate only.** Not this
knob. Spec `_next-adopt-plans.md` / `_next-adopt-ready.md`.
`adopt-bench-plans.mjs --write` → segments 80–86, `bench: true`,
`autoExpand = false`. Control segments stay empty. Never
`--user pacifist-race`. Path-switch: leftover-5 + 6W still hold;
no-rcl2-boxes and no-RCL3-roads **do not** on `placeFromPlanV2`.
Adopt is how you *site and pay* tiles — it does **not** replay 24512
(those were unowned leftovers already standing). After a 16 KEEP
(5W hatching), not on the same seed.

Next after a 16 KEEP: roster D (`_next-rcl3-roster.md`), then sticky.
Measure those at **10 e/t**, not 8.

---

## Seed (do **not** run)

`seed-clean.mjs` fills `--seed --wipe --yes --swap --force`, then
`push-pacifist` (not `push-race`), walker/object/ctrl/creep/memory
scrub, then `race.mjs`. Refuses while 15's ledger is live.

```powershell
fnm exec --using 22 node tools/server/seed-clean.mjs `
  --label cycle-16-5w-clamp `
  --note "latch+clamp+HOL skip; 5W hatches at 550; leftover-5 on; vs 29029" `
  --target-rcl 4 --tick-budget 40000
```

`--target-rcl 4` is already the default. Hygiene only (still do not
run now): `--skip-push --hygiene-only`.

Then `--watch` the **new** run id. Never `--replace-live` over 15.

---

## Watch / call

Film (`http://127.0.0.1:8767/`):

- `clamped EnergyMiner from 550 to 450` **must die**
- `shrinking stalled head EnergyMiner` on a 550 body **must die**
- hatch `WORK=5`. After leftover 2W dies: **10 e/t**, not 8
- `fiveWQueued` still **one** extra. Miners stay 2/source (KEEP) or
  1 until replacement (SEND BACK, poke dropped)
- cand L3 still **5 ext**

KEEP only on RCL4 **8/8**. Report vs this control **and** vs 29029.
Do not call on 7/8. Do not treat 24512 as the bar.

---

## Not this race

| | |
|---|---|
| leftover-5 / 6W / no-RCL3-roads / no-RCL2-boxes | already KEEP — leave on |
| sticky / roster D / adopt 16 / first-box min-chebyshev | later, one each |
| haul-2 / RCL1 HOL / recycle 200e / 5W-once flood | SEND BACK — stay dead |
| `getBody` / wait-for-600 / 6W miner / leftover-ext to unlock 5W | not the bug |
| RCL4 cadence / claim-bootstrap / planner 98/88 | off this clock |

Sister notes: `_next-5w-src.md` (src), `_next-5w-clamp.md`,
`_next-5w-hol.md`, `_next-5w-latch.md`, `_next-after-15.md`,
`_next-miner.md`, `_clean-world.md`.
