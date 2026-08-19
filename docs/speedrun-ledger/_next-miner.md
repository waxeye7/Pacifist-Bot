# Next miner knob — after the 5W latch

Read-only. No src. No `push-race`. Cycle-15 (`run-2026-08-15T23-57-10Z`,
`fiveWQueued`) latched: 2 miners/room, extra is **4W** (`_cycle15-snap.md`).
Do not keep/revert until RCL4 8/8.

Metric: mean ticks spawn→RCL4. **Miner knobs only.** One per race.
Do **not** bundle leftover-5. `amount: cap>=550 ? 6 : 4` (`:879`) is
**upgraders** (`shuttleUpgraderBody` `[2W,2C,2M]`). Not miners.

---

## Current miner bodies (home, `targetRoom == room.name`)

`spawn_energy_miner` (`rooms.spawning.ts` `:4295–4384`). Hardcoded, not
`getBody`, except the 301–549 rung.

| cap | RCL | queued | cost | e/t | what actually hatches at leftover-5 (cap 550) |
|---|---|---|---:|---:|---|
| ≤300 | &lt;5 | `[2W,M]` | 250 | 4 | — |
| ≤300 | ≥5 | `[2W,C,M]` | 300 | 4 | — |
| 301–549 | any | `getBody([2W,M], 6)` | 250 | 4 | slam-in-progress. One 250 segment (`floor(cap×0.85)` cannot buy two). |
| **550–749** | **&lt;7** | **`[5W,M]`** | **550** | **10** | **`[4W,M]` = 450 / 8 e/t** (clamp). Latch then treats 4W as “the 5W”. |
| 550–749 | ≥7 | `[4W,C,M]` | 500 | 8 | also sets `fiveWQueued` (latch a 4W). Off the RCL4 clock. |
| ≥750 | &lt;6 | `[2M,6W,M]` | 750 | 10 | leftover-5 never sits here. At 800: clamp → `[5W,3M]` 650, still 10. |
| ≥750 | ≥6 | link `[nW,C…,M…]` | 1k–1.5k | 10 | after the clock. |

`[5W,M]` = 5×100+50. Source cap is `3000/300 = 10`. 5W saturates.

Remotes (closed below RCL4 — spawn→RCL4 never sees them): probe `[2W,M]`;
cap≥500 `[4W,2M]` 500; RCL≥5 + bank&gt;25k `[8W,4M]` 1000.

Cycle-15 film: 8/8 cand = 2 miners, clamp-4W (E18S9 4W+3W leftover).

---

## Why 5W at 550 is **600e**, and how HOL / clamp break it

Body cost is 550. Two shrinkers do not use that number.

### Clamp (same producer pass, `:146–147`)

`EnergyMiner` is routine (`:311–314`). Budget `floor(hardCap × 0.85)` (`:230`)
= `floor(550 × 0.85) = 467`. 550 &gt; 467. Soft miss is not fatal; clamp
shrinks until `cost ≤ 467`.

`shrinkQueuedBody` miner (`:389–410`): no extra CARRY, `MOVE=1` stays,
`WORK>2` → drop one. **`[4W,M] = 450`**. Log: `clamped EnergyMiner from 550 to 450`.

Need `550 ≤ 0.85 × cap` → cap ≥ **647** → **7 ext**. Leftover-5 holds 5.
After the leftover 2W dies the source sits at **8 e/t**, not 10.

Upgrader already exempt at `hardCap ≤ 550` (`:234–236`) so `[4W,C,M]=500`
does not lose a WORK. Miner was not on that list.

Dirty tree already skips home `[5W,M]` (`:208–219`). **Not in the live
cycle-15 race.** `getBody` is not the culprit — this rung never calls it.

### HOL (`spawnFirstInLine` `:3027–3037`)

After 40 consecutive `-6` (`mayShrinkHead`):

```
EnergyMiner && energyAvailable < body.length * 100 && length > 3
```

`[5W,M]` length **6** → bar **600**. Cap is 550, so `energyAvailable` is
always &lt; 600. One WORK drops every 40t: 5W → 4W → 3W → 2W.

That is “5W at 550 is 600e”: the HOL yardstick is `parts × 100`, not
`bodyCost`. RCL1–3 interleave is every **10**t (`INTERLEAVE_EVERY_RCL1_3`).
A 550 HOL spends into 300e builders / 450e shuttles, so stall can pass 40
before the network refills.

`depotSink` (`carry.ts:170–173`) holds a 550 spawn floor at **RCL3 only**.
RCL2 has no depot.

Clamp skip without HOL skip is a 40-tick delay before the same 4W. **One
knob = both skips.** Do not change the 550 producer or drop `fiveWQueued`.

---

## 6W miner (700e, needs 7 ext) — too late for slam?

Slam is RCL2 5 ext → cap 550 → 5W. Next ext rung is leftover-5 (do not
bundle). 7 ext = cap **650**.

| body | cost | ext | HOL bar (`len×100`) | yield |
|---|---:|---:|---:|---|
| `[6W,M]` (does not exist) | 650 | 7 | **700** | 10 (source cap) |
| `[6W,2M]` / `[6W,C,M]` | 700 | 8 | 800 | 10 |
| shipped `[2M,6W,M]` (`:4333`) | 750 | 9 | 900 | 10 |

Same HOL trap as 5W@550: `[6W,M]` is 650e / 7 parts → bar **700**. At 7
ext, available is always &lt; 700. Clamp at 650: `floor(650×0.85)=552` →
drops WORK → **5W**. At 800 (leak-to-10): `floor(800×0.85)=680`, 750&gt;680
→ `[5W,3M]` 650 (`_rcl3-instant-steelman.md` ch.6). Live 6W never hatches
on the RCL3 climb.

5W already saturates the tile. 6W is 12 theoretical, 10 delivered. Walk
of `[6W,3M]` vs `[5W,M]` is ~0.3 e/t room-wide; 15k / 0.3 ≈ 50k ticks
(`_ext-6w.md`). Climb is 135k/16 ≈ 8.4k. Spawn tax +200e/miner.

**Dead.** SURFACE already lists 6W miner later. Too late for slam (slam
bought the 10 e/t rung). Do not spend 2–5 leftover ext to chase it.

---

## 2-source HOL + drop T+100 (SURFACE #1) — unrun on *clean* leftover-5

Every bench room is 2-source. Spec: `_next-rcl1-bootstrap.md`.

**Live now** (cycle-6 SEND BACK deleted `isRcl1Bootstrap` / `hatchedHomeHauler`
— `_review-src.md`): both home sources independently unshift `[2W,M]` 250
when `lastSpawn` ages out. Opening 300 buys one; leftover 50 cannot buy
the `[C,C,M]` 150 first hauler (`getCarrierBody` `:3685–3688`) or the
`index==1` `[C,M]` sweeper (`:4218–4222`). Head is source B’s 250.

No T+100 stamp in src. That was `lastSpawn = T − (1500 − 100)` on the
cycle-0/6 `[W,C,M]` first miner. Replacement is now `T + rand − 450` or
`T − 20` (`:4378–4383`). Tick-0 `!lastSpawn && Game.time < 1500` (`:4466`)
is inert on this seed (~4.7e6).

**Cycle-6** ran harvest-to-spawn (`[W,C,M]` + `[C,M]`) after leftover-5
KEEP and **SEND BACK** (RCL4 30139 vs 28818, +1321). That was the 7/8
dirty 24512 world, not clean-seed leftover-5+6W (cycle-8 **29029 8/8**,
`_clean-world.md`). The *fixed* pair — one miner until a hauler
**hatches** (`hatchedHomeHauler`, not `roomHasHauler`) + drop T+100 — is
still unrun on that clean 8/8 mark.

`dumpMinerEnergy` (`energyMiner.ts:188–216`) walks a load in only when
RCL≤2, no **hatched** hauler, spawn/ext Chebyshev ≤8. Far source always
drops. A CARRY miner cannot drop-mine — dump is a harvest skip.

Sign can flip on far-only rooms (hard band `srcStepsSum` 21–47). Mean
and pair split both required. **Not the next knob after latch.**

---

## Ranked miner A/Bs (one knob, model Δ)

Do not bundle leftover-5, 6W-shuttle amount, recycle-200e, remotes,
`getBody`, or roster D.

| # | knob | vs live after 15 | model Δ spawn→RCL4 | spec |
|---|---|---|---|---|
| **1** | **Clamp skip + HOL-600 skip** so home `[5W,M]` waits for 550 and hatches 5W | latch extra is 4W; after 2W dies **8 e/t** | **−150…−600** (R2→3 −100…−400, R3→4 −50…−200). Two sources −4 e/t × ~1500t ≈ 6k ≈ 375t on a 16 e/t sink. | `_next-5w-clamp.md`. Dirty tree has clamp (`:208–219`); HOL `:3029` still needed. |
| **2** | **Safer overlap** — one-shot unshift, do **not** `lastSpawn=0`; count `c.body` WORK | only if 15 REVERT for flood / hatch-0 / tick-0 holes | same overlap as 15, without the cycle-13 gun | `_next-5w-latch.md` §safer. Separate from #1. |
| **3** | **1-seat ignore-creeps** (`getOpenPositionsIgnoreCreeps` / adjacent counts) | sitting 2W zeros the seat → no overlap (E12S3 far `(47,33)`) | **−250…−400 on that room** (6 e/t × ~800t ≈ 4.8k). Mean small. After #1 so the extra is 5W. | `_late-rooms.md` 1-seat. |
| **4** | **2-source HOL: one miner until hauler hatches; drop T+100** | live is two 250s + `[C,C,M]` waiting regen. Cycle-6 SEND BACK on dirty leftover-5 | spawn→2 **−50…−200** near/split; **sign can flip (+)** far-only | SURFACE #1, `_next-rcl1-bootstrap.md`. Unrun on **clean** leftover-5 8/8 only. |
| **5** | **6W miner** (650/700/750) | not queued at leftover-5; clamp/HOL would unshrink it to 5W anyway | **+0** yield. Ext tax if you buy 7–9 ext to reach it. | dead. `_ext-6w.md`. |

#1 is income. #2 is flood-safety. #3 is one hard room. #4 is RCL1 and
already lost once. #5 is closed.

---

## After cycle-15 — which to run

Wait RCL4 8/8. Hygiene (`_clean-world.md`) is a gate, not a knob.
Race **latch vs latch+#1**, not vs cycle-13 flood.

**If 15 KEEP** (no flood, RCL4 8/8 beats control or is a clean keep):

Run **#1**. Later income knobs (sticky pickup, roster D) must measure
at **10 e/t**, not 8. Do not touch `fiveWQueued`. Do not site leftover
ext to “unlock” 5W — 550 already fits; clamp/HOL are why it does not
hatch.

**If 15 REVERT** (flood, or lose RCL4 without flood):

- Flood / 3+ miners: **#2** first (kill `lastSpawn=0`), then **#1**.
  Do not re-ship cycle-13/14.
- Lose without flood: skip overlap. Still run **#1** so the *replacement*
  (when the 2W `lastSpawn` expires ~T+1050 after 550) is 5W, not 4W.
  Or leave miner and take `_next-after-15.md` #2 (roster D) — not a
  miner knob.

Do **not** run #4 or #5 next. Do **not** reopen leftover-5 to buy 6W
or to make clamp’s 647 bar. Do not push over the watching run.
