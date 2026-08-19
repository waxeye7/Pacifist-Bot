# Next A/B — stop clamp from turning `[5W,M]` into 4W

Read-only. No src. Cycle-13 flood was `lastSpawn=0` while live
`WORK<5`. Cycle-14/15 latched with `fiveWQueued`. The extra miner is
still **4W**. This is why.

Metric: mean ticks spawn→RCL4. One knob. Do not bundle leftover-5,
amount-6, recycle-200e, or `getBody`.

---

## Why `[5W,M]` 550e becomes 4W

Producer (`spawn_energy_miner`, `:4346–4361`). Home, cap `550–749`,
RCL&lt;6: hardcoded

```
[WORK,WORK,WORK,WORK,WORK,MOVE]   // 5×100 + 50 = 550
```

Not `getBody`. Then `lastSpawn = T`, `fiveWQueued = true`.

Same producer pass (`:146–147`) calls `clampSpawnListToCapacity`.
`EnergyMiner` is routine (`ROUTINE_SPAWN_PREFIXES` `:311–314`).

```
budget = floor(hardCap * 0.85)          // :230
       = floor(550 * 0.85) = 467
```

550 &gt; 467. Soft miss is not fatal (`:279–287` only drops over
`hardCap`). Clamp **shrinks** until `cost <= 467`.

`shrinkQueuedBody` EnergyMiner (`:389–410`):

1. no extra CARRY
2. `MOVE=1` is not `> ceil(5/2)=3` → keep the MOVE
3. `WORK>2` → drop one WORK

`[4W,M] = 450 ≤ 467`. Stop. Log: `clamped EnergyMiner-… from 550 to 450`.

Hatch is **8 e/t**, not 10. Source cap is 10. Slam-5 paid 15k for this
rung and the clamp gives it back.

Same 467 is why Upgrader already has an exemption (`:234–236`):
`[4W,C,M]=500` would also lose a WORK. Miner was not on that list.

---

## `getBody` is not the culprit

`getBody` (`:3596–3619`) uses the same 85% stack budget, **and** keeps
one oversize segment if it fits raw cap:

```
maxSegments = floor(467/550) = 0
segmentCost 550 <= capacity 550 → emit the full [5W,M]
```

The 550 miner never calls `getBody`. The &lt;550 rung does
(`getBody([2W,M], 6)` `:4364`) and correctly stays one 250 segment.
Changing `getBody` does not unshrink a body the producer already
hardcoded.

---

## Cycle-14: 5W check saw 4W → flood → latch

Overlap (`:4266–4281`): cap ≥550, no `fiveWQueued`, live miner
`WORK<5`, a free seat → `lastSpawn = 0` → this pass queues another
“5W”.

Clamp already turned the queued body into 4W. Hatch `WORK=4`. Check
stays true. Next cadence unshifts again. Cycle-13: **15 miners/source**.
Cycle-14 comment: **14**.

`fiveWQueued` (`:4270`, `:4361`) is the latch. One extra body, then
silence. That body is still 4W. After the leftover 2W dies the source
sits at **8 e/t** until that 4W expires (~1500t).

---

## Second shrink (still live after a clamp skip)

`spawnFirstInLine` HOL (`:3033–3043`), after 40 consecutive `-6`:

```
EnergyMiner && energyAvailable < body.length * 100 && length > 3
```

`[5W,M]` length 6 → bar **600**. At cap 550, `energyAvailable` is
always &lt; 600. One WORK drops every 40t: 5W → 4W → 3W → 2W.

RCL1–3 interleave is every **10**t (`:3069–3070`). A 550 HOL spends
into 300e builders / 450e shuttles, so stall can pass 40 before the
network refills.

`depotSink` (`carry.ts:170–173`) already holds a 550 spawn floor at
RCL3. RCL2 has no depot.

---

## One knob

**Stop shrinking a home `[5W,M]` that already fits cap.** Clone the
Upgrader 550 exemption. Site: `clampSpawnListToCapacity`, before the
85% budget (`:221–230`).

```
if (name.startsWith("EnergyMiner")
    && hardCap >= 550
    && body is home [5W,M] cost 550)
    continue;   // wait for energyAvailable >= 550
```

Do **not** change `getBody`. Do **not** change the 550 producer rung.
Do **not** drop `fiveWQueued` (still the flood latch).

Dirty tree already has this skip at `:208–219`. Not in the live
cycle-15 race.

**Must-ship, else 5W still dies after 40t `-6`:** skip the HOL shrink
when `bodyCost <= energyCapacityAvailable` (`:3035`). The head fits
cap; it is waiting for fill, not oversized. Without this the clamp
skip is a 40-tick delay before the same 4W.

### Alternate wording (same knob)

Only **queue** the 550 miner when `energyAvailable >= 550`. Gate
alone is a **no-op**: clamp still runs the same pass and 550 &gt; 467
even at a full network. Gate needs the clamp skip or it is not a
knob.

Prefer the skip (always keep 5W, wait). `carry.ts` already tries to
hold 550 at RCL3. Shrinking when available &lt; 550 is how we got 4W
in the first place.

---

## Model vs cycle-15 latch (4W extra)

Latch overlap: 2W+4W = 12 theoretical, still 10 delivered. After 2W
dies: **8 vs 10**. Two sources −4 e/t for the rest of that 4W life
(~1500t) ≈ 6k energy. 6k / 16 e/t parked sink ≈ **375t** on the 135k,
plus slower ext/box fill on the 45k.

| clock | Δ vs latch | why |
| --- | --- | --- |
| spawn→RCL2 | ~0 | 550 is after 2 |
| RCL2→RCL3 | **−100…−400** | 10 e/t into box/`pressure.burn` instead of 8 |
| RCL3→RCL4 | **−50…−200** | enter 3 already at 20 e/t in |

Does not raise the shuttle sink. Same overlap tax as cycle-13/14
(2W leftover TTL) but the extra body is actually 5W.

---

## What not to bundle

- `fiveWQueued` / lastSpawn=0 — already latched; this unshrinks that
  one body.
- `getBody` 85% / oversize-segment — already correct; unused here.
- Cap 750 `[2M,6W,M]` — still clamped to `[5W,3M]` 650 at 800
  (`_rcl3-instant-steelman.md` ch.6). Different rung.
- Leftover-5, amount 6 after 550, recycle 200e — other surface rows.
- Broad “skip 85% if `cost <= energyAvailable`” — re-opens the RCL5
  1800 maintainer HOL the 85% exists for.

Race on cycle-15 (latch) vs latch+skip. Not on cycle-13 flood.
