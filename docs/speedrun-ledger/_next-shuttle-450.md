# Next A/B — shuttle `[2W,2C,2M]` at 450 (3 ext), not 550

Read-only. **No src.** Amount-6 after 550 and leftover-5 stay.
Do **not** `push-race`. Do **not** `server:local:reset`.

Metric: mean ticks spawn→RCL4. One knob. Model Δ, not a race number.

```
NEVER  npm run push-race
NEVER  server:local:reset
NEVER  leftover-5 / slam-5 / amount-6 / 5W / recycle-200e
```

Sister notes: `_rcl2-still-open.md` §1, `_rcl2-ideas.md` leftover
trickle, `_next-rcl2-sink.md` (do not bundle), `_next-5w-hol.md`.

---

## Verdict

**Not a 5-line apply.** Body gate and leftover-5 share the 550-cap
HOL stack. Cheap `>= 550` → `>= 450` in `shuttleUpgraderBody` is the
one-line *recipe*, not a safe ship.

**Leave live.** Race later only if leftover-5 film still shows a
200e `[W,C,M]` on the controller ≥400t after cap 550.

---

## Live (`rooms.spawning.ts`)

| | now | leave |
|---|---|---|
| `shuttleUpgraderBody` `:3366–3370` | `[2W,2C,2M]` iff `cap >= 550` else `getBody([W,C,M])` = **200e** | this knob *if* raced |
| RCL2 `amount` `:882` | `cap >= 550 ? 6 : 4` (cycle-4 KEEP) | **550** |
| RCL3 `amount` `:925` | **4** (shuttle until depot, then parked 4W) | 4 |
| Home miner `:4402` | `[5W,M]` at `cap >= 550` | **550** |
| leftover-5 | hold 5 ext through RCL3 → cap **550** | hold |
| Recycle 200e | off (cycle-7 SEND BACK) | off |

`getBody` at cap 450: 85% = 382. Two `[W,C,M]` = 400. Stays **200e**.
That is why the 450 body is hardcoded, not a `getBody` stack.

Census (`upgrader` in-room, no body check) does not retire living
200e. Flip pays only as **deaths** between ext 3 and 5. Same no-op
shape as crossing 550 today (`_next-rcl2-sink.md`).

---

## Why leftover-5 blocks the cheap flip

Leftover-5 *is* cap 550. The 450e shuttle is cheap **there**
(450/550 ≈ 82%). The upgrader clamp (`:234–236` `hardCap <= 550` →
`budget = hardCap`) exists so that leftover-5 450e shuttle / 500e
parked 4W is not 85%'d (`floor(550*0.85)=467` strips a WORK off
`[4W,C,M]`).

At **3 ext (cap 450)** the same 450e body is **100% of cap**:

- Clamp will not shrink it (same `<= 550` exempt).
- Hatch needs `energyAvailable == 450`. Slam still has 2×300e
  builders. Bank is rarely full.
- RCL≤3 interleave every 10t (`:3074–3077`) spends those builders
  out of the 450 the head is waiting for — same shape as leftover-5
  5W HOL (`550 < length*100=600`, `_next-5w-hol.md`).
- Amount-6 at 450 would queue six 100%-cap bodies during slam.
  Cycle-4 KEEP left 6 **after 550** so the last two ext still finish.

A one-line body flip therefore either:

1. HOL-stalls slam (100% body + interleave + builder spend), or
2. Needs extra HOL skips / budget rules in the leftover-5 550
   family (`:208–219` miner clamp skip, `:234–236` upgrader
   100% budget, `:3022–3027` 5W HOL skip).

That is the entanglement. Do not touch those rungs for this knob.

After slam, leftover-5 rooms are already cap 550. Body is already
`[2W,2C,2M]`. The cheap flip is a **no-op** on the leftover-5 climb.

---

## Exact change if raced (later)

One line. File `src/Rooms/rooms.spawning.ts` `shuttleUpgraderBody`:

```ts
return room.energyCapacityAvailable >= 450
    ? [WORK, WORK, CARRY, CARRY, MOVE, MOVE]
    : getBody([WORK, CARRY, MOVE], room);
```

**Leave** `:882` `amount` at `>= 550 ? 6 : 4`.
**Leave** `[5W,M]` at 550. **Leave** slam-5 / leftover-5.
**Do not** recycle 200e. **Do not** stop siting at 3 ext.
**Do not** add a 450e clamp/HOL skip (that is a second knob, and
it shares leftover-5's 550 exemptions).

RCL3/4 still call the same helper pre-depot. At leftover-5 cap
550 the ternary is already the 450e branch.

---

## Model

| clock | Δ |
|---|---|
| spawn→RCL2 | ~0 (gate is mid-slam) |
| RCL2→RCL3 | **−0 to −400** if a 200e dies in the 3-ext…5-ext window; ~0 if leftover TTL at 3-ext is still long |
| RCL3→RCL4 | ~0 (leftover-5 already 550 / 450e) |

Smaller than dead recycle-A. Original “0.99 e/t ~750t earlier”
assumed the roster flips; amount stays 4 until 550.

Sign can flip **(+)** if a 450e head HOL-blocks the last 6k of slam
and delays `[5W,M]`. Cycle-16 is the 5W hatch; do not stack this
on that seed.

---

## Do not bundle

- leftover-5 / instant-10 / trickle-ext / `maxSitesFor` / `RCL2_ORDER`
- amount 4 vs 6 (KEEP at 550)
- recycle / suicide 200e
- 5W lastSpawn / clamp / HOL skip
- parked 4W / RCL3 amount
- far-ctrl depot (`_next-far-ctrl.md`)

## Order

After cycle-16 5W is called, and after far-ctrl depot if that is
next. Then only if film still shows long 200e leftover.
