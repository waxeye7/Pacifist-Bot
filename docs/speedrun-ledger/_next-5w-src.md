# Src — home `[5W,M]` clamp skip + HOL exempt

2026-08-16. **Src only. Not a live push.** Did not run `push-race` /
`push-pacifist` / `git push`. Cycle-15 (`run-2026-08-15T23-57-10Z`,
`fiveWQueued`) is still watching — extra body is clamp-4W
(`_cycle15-snap.md`). This is the **cycle-16 knob**.

Metric: mean ticks spawn→RCL4. One knob = both skips. Do **not**
bundle leftover-5, 6W shuttle `amount`, haul MAX, roads, boxes,
`getBody`, the 550 producer, or `fiveWQueued`.

Sister notes: `_next-5w-clamp.md` (85% budget), `_next-5w-hol.md`
(length×100=600), `_next-5w-latch.md` (flood). Specs said “do not
apply.” Both halves are now in `src/Rooms/rooms.spawning.ts`.

---

## Verdict — both halves present, spawn at 550

| site | lines | src now |
|---|---|---|
| clamp skip | `:208–219` | **yes** — `continue` on home `[5W,M]` cost 550 |
| HOL exempt | `:3029–3035` | **yes** — EnergyMiner clause AND-not `[5W,M]` 550 |
| wait-for-600 | — | **absent** (correct — leftover-5 cap is 550) |
| `isHomeFiveWMiner` helper | `_next-5w-hol.md` | **not** extracted; both rungs inline |
| leftover-5 / 6W / haul | — | **untouched** |

`spawnCreep` still prices `bodyCost=550`. HOL bar `length*100=600` is
only the shrink yardstick. After both skips, a leftover-5 room
**waits for `energyAvailable >= 550`**, then hatches 5W. It never
fills 600 (spawn 300 + 5×50). Waiting for 600 would fall through the
550 producer to `getBody([2W,M])` (`:4364`) and never queue a 5W.

Not in the live cycle-15 compile. Dirty WC: `src/Rooms/rooms.spawning.ts`.

---

## Clamp skip (`clampSpawnListToCapacity` `:208–219`)

85% of 550 is 467. Without this, same-pass clamp (`:146–147`) walks
`shrinkQueuedBody` until `cost ≤ 467` → `[4W,M]=450`.

```
EnergyMiner && hardCap >= 550 && length === 6
  && home (!targetRoom || targetRoom === room.name)
  && bodyCost === 550 && WORK === 5 && MOVE === 1
    → continue   // do not 85%-shrink
```

Upgrader 550 exempt (`:234–236`) stays. Miner is not on that list;
this is the miner twin.

---

## HOL exempt (`spawnFirstInLine` `:3027–3036`)

`mayShrinkHead` after 40 consecutive `-6`. EnergyMiner used to fire
whenever `energyAvailable < length*100 && length > 3`. `[5W,M]`
length 6 → bar **600**. Cap 550 ⇒ that compare is **always true**,
so HOL dropped a WORK every 40t (5W → 4W → 3W → 2W) even on a full
network that was only waiting for fill.

Now the EnergyMiner arm is:

```
EnergyMiner && energyAvailable < length*100 && length > 3
  && !(cap >= 550 && length === 6 && bodyCost === 550 && WORK === 5)
```

Home `[5W,M]` does **not** shrink. Head stays 550. Spawn when
`energyAvailable >= 550`.

Predicate vs clamp skip: HOL omits the home (`targetRoom`) check and
`MOVE === 1`. Still matches the hardcoded home body
(`:4356–4357` `[5W,M]`). Broader than clamp (would also spare a
remote 550/6/5W). Fine — remotes are off the spawn→RCL4 clock.
Did **not** extract `_next-5w-hol.md`'s `isHomeFiveWMiner`; did
**not** retighten.

Operator bind is correct: `&& !(` is on the EnergyMiner clause only
(`&&` tighter than `||` Carrier / Reserver).

---

## Why both, or neither

| ship | leftover-5 hatch |
|---|---|
| clamp skip only | HOL 4W after 40t `-6` |
| HOL exempt only | clamp already made 4W same producer pass |
| wait-for-600 | **never** — cap 550; fall-through is 2W |
| **both skips** | **5W at 550** |

Cycle-16 race: latch+4W (cycle-15 KEEP, if it holds) vs latch+real
5W. Not vs cycle-13 flood. Not mid-race on `23-57-10Z`.

Watch next seed: `clamped EnergyMiner from 550 to 450` must die;
`shrinking stalled head EnergyMiner` on a 550 body must die; hatch
`WORK=5`. `fiveWQueued` still one extra.

Model vs cycle-15 latch-4W (`_next-5w-clamp.md`): after leftover 2W
dies, **8 vs 10 e/t** for the rest of that life (~1500t) ≈ 6k ≈
**375t** on the 135k. RCL2→3 **−100…−400**, RCL3→4 **−50…−200**.

---

## What not to bundle

- leftover-5 / `extensionTake` / 6W `amount` / haul MAX
- `fiveWQueued` / `lastSpawn=0` — flood latch; keep
- `getBody` 85% / oversize-segment — unused on the 550 rung
- HOL `length*100` → `bodyCost` for every miner — still shrinks a
  550 head sitting at 400
- Queue gate `energyAvailable >= 550` or `>= 600` — no-op or 2W
  fall-through
