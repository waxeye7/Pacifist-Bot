APPLIED IN SRC (not pushed). seed-clean cycle-16-5w-real is running — no push-pacifist.
File: src/Rooms/rooms.spawning.ts case 2 only. RCL3 already had the gate.
RCL2 repair push (`:1397`) was miner + !danger + progress>4500 (10% of 45k), no hit check.
Now also requires earlyRepairNeeded: container/road with hits+1000 < hitsMax.
Order unchanged: miner → carrier → repair → builder → upgrader. amount 1, [W,C,M] 200e.
RCL3/4+ / repair.ts / queuedWithPrefix / spawn_list census untouched.
Clean leftover-5: box life 25k, so this skip is the usual path. Dirty leftovers still hatch.
Do not push-race, reset, or git push. Cycle-15 stayed SEND BACK; this is src only.

# Next A/B — home repairer on spawn→RCL4 / VPS?

Read-only. No `src` edit. No `push-race`. No `server:local:reset`.
Cycle-15 (`run-2026-08-15T23-57-10Z`) stays watching.

Metric: mean ticks spawn→RCL4. Model deltas, not race numbers.
One knob or skip. Do not bundle leftover-5, 5W clamp, overlap-4W,
roads, haul, or `repair.ts` retarget (VPS RCL6–8 uses that file).

---

## Verdict

**Skip as next.** Waste is real. It is not SURFACE / after-15.

RCL2–3 home `repair` is a 200e tax that does not keep anything alive
on this clock. Owned container life is **25k ticks**; the 135k is
~9–13k. Roads are not paved (`0` roads on cycle-15 film). Ramparts
are `SHELL_MIN_RCL = 4`.

If raced later: **one knob — do not queue a home `repair` at RCL2 or
RCL3.** Leave `repair.ts` and the RCL4+ storage/rampart gates alone.

**VPS: not this question.** No owned RCL3–4 room (W3N3 is RCL1
spawnless; the rest are RCL6–8). Mature-room wall dump is a
different latch (`rooms.ts` `targetRampRoom.urgent`, 36W / ~72 e/t).

---

## Live gates (`rooms.spawning.ts`)

| | amount | body | queue when |
| --- | ---: | --- | --- |
| RCL2 `:896–901` / `:1395` | 1 | `[W,C,M]` **200e** | miner in-room, `!danger`, **`progress > 4500`**, no hit check |
| RCL3 `:939–947` / `:1452` | 1 | `[W,C,M]` **200e** (not `getBody`) | after eco + overlap 4W, **`earlyRepairNeeded`** |
| RCL4 `:989–993` / `:1467` | 1 | `getBody([W,C,M], 50)` | real storage E floors + (ramparts &lt; 60k **or** `%2000<400`) |

`earlyRepairNeeded` (`:3341–3347`): any **container or road** with
`hits + 1000 < hitsMax`. Census (`:639–643`) is in-room `role ==
"repair"` only. `spawn_list` is not counted. RCL2/3 do **not** use
`queuedWithPrefix` (RCL4+ does). `%500` refill (`:136`) can append a
second `Repair-` while live is still 0 — matches cycle-15 film
**E13S7 “2 repair”**.

Producer order:

- **RCL2:** miner → carrier → **repair** → builder → upgrader.
  200e sits **in front of** the shuttle/builder on the same pass.
- **RCL3:** builder → upgrader → overlap 4W → **repair**. After eco.
  CYCLE-0 already moved this.

RCL4 `storage` in the gate is whatever `findStorage` returned. A hub
container caps at 2k, so the 15k/20k/50k arms are dead until a real
bank stands. **Off the spawn→RCL4 stamp** (`rclTimes[4]` is the tick
`level` becomes 4; storage is after).

---

## What the body actually does (`repair.ts`)

`findLocked` at `level > 2` (`:65–67`) **excludes roads and
containers** from the primary list (1000-hit slack). RCL3 has no
ramparts, no walls, and spawn/ext/tower do not decay → primary is
**empty**. Fallback (`:160–163`) is any `hits < hitsMax`, **no
slack**, closest at `level ≤ 3`, lowest-hits after.

So the RCL3 repairer tops containers (and leftover roads) **to
`hitsMax`**. One owned decay event is 5000 hits / 500 t = 50e for a
1W. Then idle until the next lump.

Energy:

- RCL3, no bank: `findStorage` is the hub at `spawn.y-2`
  (`creepFunctions.ts:758–771`). Else
  `acquireEnergyWithContainersAndOrDroppedEnergy` — source piles and
  the **depot**. 50e yoink off the parked 4W / floor.
- Full belly + no lock: `repairing` stays true (`:279–288`). Sits on
  50e. Never upgrades.
- `helpBuild` (`:262–276`) is RCL4 + no storage + `creeps < 8`. Race
  rooms at 4 are already ≫ 8. Dead.

RCL2 `findLocked` (`:68–70`) **includes** roads/containers. Same
top-off / idle if nothing is 1000 down.

---

## Decay vs the clock

Owned container: `CONTAINER_DECAY` 5000 / `CONTAINER_DECAY_TIME_OWNED`
500 → **10 hits/t**, 250k / 10 = **25 000 ticks**. CYCLE-0 “5000-tick
life” is the **unowned** rate. Do not use it here.

Road: 5000 hits, 100 / 1000 t → 50k ticks without traffic. RCL3
policy is no-pave. Cycle-15 E18S9 / E18S5 / E13S7 / E12S3: **0 roads**.

Ramparts: `SHELL_MIN_RCL = 4` (`Perimeter.ts`). Not on the 135k.

A container born on this run (hub during slam, depot after RCL3,
source box if sited) outlives spawn→RCL4 on the leftover-5 mark
(**24512**). Slow tail (E18S9 class, RCL3 ~20k) can press a **RCL2**
hub toward 25k elapsed — still after `rclTimes[4]` on rooms that
already hit 4, and the hub is 2k energy, not a source box. Dirty-world
pre-damaged leftovers are a hygiene problem (`_clean-world.md`), not
a reason to keep the rung.

---

## Model Δ (not a race number)

RCL2 `progress > 4500` is **10% of 45k**, not late-RCL2.
`_rcl2-ideas.md` “30–80 t once” undercounts. At ~4 e/t that is ~1.1k
ticks into 2; remaining ~7–10k ticks; TTL 1500 → **6–7 × 200e**.

| treatment | spawn→RCL4 | why |
| --- | --- | --- |
| **A — do nothing** | 0 | live |
| **B — RCL2 arm off** (delete `:1395` or require `earlyRepairNeeded`) | **−200…−400** | 6–7 × 200e + 6 t HOL in front of shuttle/builder. Some 200e hatches on an otherwise idle spawn (upgraders at cap) — still 200e off the floor. |
| **C — RCL3 arm off** (delete `:1452`) | **−50…−200** | already after eco; 1–2 bodies / climb + 0.1 e/t × N boxes top-off + depot yoink. Film: 1 repair typical, 2 when `%500` doubles. |
| **D — both B+C** (the one later knob) | **−250…−500** | RCL2 is most of it. |
| role: stop topping to `hitsMax` | **~0…−50** | spawn tax remains. Do not touch `repair.ts` for a race. |
| RCL4 `getBody` / rampart dump | **0** | after `rclTimes[4]`. Cap 550 → `[2W,2C,2M]` 400e once bank ≥20k. RCL4→5 / RCL8 later. |

Compare after-15: clamp **−150…−600**, overlap-4W **−200…−800**
(tail **−1k**). Those raise e/t. This cuts a **0.2–0.5 e/t tax**.

Sign-flip: none on a clean leftover-5 + no-RCL3-roads seed. Dirty
leftover container already &lt; ~50k hits could die on a 25k+ room —
hygiene, not this A/B.

---

## VPS

`_status-vps.md` / `_vps-w3n3.md`: W1N1 RCL8, W2N1/W3N1 RCL7,
W1N2 RCL6, **W3N3 RCL1 spawnless**. Zero RCL3–4.

RCL6+ repair is amount 4 / 13W, gated on bank 50–150k. Thin rooms
(W2N1 E=0, W1N2 E=730) do not pass. W1N1 130k can take the
`%3000<100 && E>50k` arm — wall pump, not a 135k leak.

Do **not** ship a role retarget to “fix RCL3” onto VPS. Same
`repair.ts` is the nuke / sanctioned-rampart path.

---

## Film (cycle-15, L3, 0 roads)

`_cycle15-e18s9.md` tick 4718372: E18S9 / E18S5 **filler + repair**,
E13S7 **filler + 2 repair**. 4–5 boxes. leftover-5 holding (5 ext).
The body is present. It is not why E18S9 is at 19709.

---

## One later knob (not now)

```
// case 2: delete the repair push (`:1395–1398`)
// case 3: delete the repair push (`:1452–1455`)
// leave spawnrules entries (dead) or amount: 0
// do not change case 4+ / repair.ts / RemoteRepair
```

Do not also add `queuedWithPrefix` / raise slack / change
`findLocked`. That is a second knob.

Do not suicide living `[W,C,M]` repairers mid-race (cycle-7 shape).

---

## Not next, not bundled

| | |
| --- | --- |
| after-15 #1 5W clamp | sink 8→10. First if 15 KEEP. |
| after-15 #2 overlap 4W | sink 8–12→16. |
| leftover-5 / no-RCL3-roads | KEEP. Why skip is safe. |
| RCL4 cadence / storage floors | off this clock. |
| maintainer | already dropped at RCL3 (CYCLE-0). |
| `repair.ts` / nuke / sanctioned ramparts | VPS. |
| RemoteRepair | RCL4+, `hasWork` already gated. |
| Clean-world scrub | gate, not a knob. |

Wait RCL4 8/8 on 15. Then `_next-after-15.md` #1/#2. Park this
behind those.
