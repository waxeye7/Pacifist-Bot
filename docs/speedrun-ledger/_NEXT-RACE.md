# Next race queue — after contaminated baseline

After `run-2026-08-14T01-06-48Z`. Do not implement on that run. Do not `push-race`.
Do not `server:local:reset`. One knob per race. Metric: mean ticks spawn→RCL4.
Deltas are model (`_SURFACE.md` + the `_next-*` notes), not race numbers.

Leftover-5 was **not** closed — cycle-2 leaked (legacy rooms site 10 at RCL3).
Src now holds 5 on BasePlan + checkerboard + planV2. Not pushed (cycle-4 live).
Trickle-ext / 6W miner / instant-10 — closed. Remotes, supporters, planner 98/88 — later.

**Next seed after cycle-4:** leak-close + rec C (one treatment: leftover-5 actually holds).
Revert cycle-4 6W unless RCL4 8/8 beats control. Then `_SURFACE` #1 RCL1 HOL.

---

## 0. World hygiene (gate, not a knob)

This world is not a race shard (`_race-autopsy.md`). `pacifist2` CCK murdered
most control rooms and cand E9S1 / E21S4. `race.mjs --wipe` does **not** clear
`Memory.rooms`. Candidate also owns eight RCL8 rooms (67 Redis rooms).

Before any next seed:

1. **`pacifist2` offline.** No CCK, no `commandsToExecute`, no expand onto the
   bench (E21S4 was `target_colonise` 807t before seed).
2. **Wipe + memory.** `--wipe --yes`, then console
   `delete Memory.rooms[…]` on both racers + `resetSpeedrun()`.
3. **No leftover RCL8 plan.** E4S7 ran this race with `planV2`,
   `rclTimes.8: 3121322`, `startTick` before seed. Next seed: empty rooms,
   no adopted v2, no `rclTimes.8`.

`--swap` is still mandatory on set `1f90aub`.

---

## Ranked A/Bs (one knob)

Order is `_SURFACE.md`. Specs: `_next-rcl1-bootstrap.md`, `_next-rcl2-sink.md`,
`_next-haul.md`, `_next-boxes.md`. Do not bundle. Do not touch ext-take.

| # | knob | vs live | model Δ |
|---|---|---|---|
| **1** | RCL1 2-source HOL: one miner until a hauler **hatches**; drop T+100 re-arm | opening 300 buys 250 2W; 3rd miner at T+100 | spawn→2 **−50…−200** near/split; **sign can flip (+)** far-only. Read mean **and** pair split. |
| **2** | Recycle `[W,C,M]` the tick cap hits 550. Keep `amount: 4`. Census skips suicide; rewrite 200e `spawn_list`. | 200e work until death (~400–1500 TTL at 2.0 e/t) | **−2k…−6k** on leftover 30k (4.0 vs 2.0). Biggest model gap. |
| **3** | RCL2 `amount` 4 vs **6 after 550 only** | `amount: 4` always | **−1.5k…−2.5k** (5.9 vs 4.0). Not during slam. On winner of #2 vs control — not the same race. |
| **4** | Hold RCL3 at **2** shuttles until depot stands | `amount: 4` from tick 0 of 3 | **−300…+200**. Race on **slam-5 baseline**, not on #2 (four 450e already live → inert). |
| **5** | `MAX_HOME_CARRIERS_PER_SOURCE` **3 → 2** | 3 (+ `pressure.haul` 4th) | spawn tax, likely-flat (extras stack; E4S7 6–7 CA). Keep 1:1 / 4C. |
| **6** | RCL2 first box = min chebyshev / `si` among early source seats | `container[0]` object order | **−200…−800** on 6/16 far-first (E9S1, E13S9, …); ~0 else. Not two boxes at RCL2. |
| **7** | Force `[5W,M]` `lastSpawn=0` at 550 | 2W stamp ~T+1050 | **−100…−400**. After #2/#3. Does not raise the 4-shuttle sink. |

Then, still one at a time: source-sticky pickup → kill `pick(false)` fallback →
hold 2nd source box off the 135k (**−0…−500**). Depot tile is **not** an A/B
(all 16 already ≤4, not source-adj).

SURFACE #8 (dark rooms) is §0, not a race.

---

## What this baseline can still teach

Not a spawn→RCL4 A/B. Control is 1/8 (E5S3). Cand E9S1 died after RCL2; E21S4
never hit 2. Pair means are junk. **Keep watching; do not restart this run.**

- **Candidate RCL3 13131 (n=5/8)** at tick 3137294 (`_RUNNING.txt`). Honest
  mean of rooms that already hit 3. Not 8/8, not vs control.
- **RCL4** only if the remaining **6** living candidate rooms finish (E4S7,
  E3S5, E8S5, E8S3, E6S1, E13S9). Control RCL4 will be 0 or 1.
- Film on those six is still the slam-5 control for #2/#4/#7: leftover 200e at
  550, haul stack, far-first box, depot→tower.
- **Do not keep** any cycle-0 change off this run. E4S7 381 / fast 3 is leftover
  RCL8 plan + easy profile (`ctrlSteps: 3`), not the same experiment as the
  ~950–1050 cluster.
