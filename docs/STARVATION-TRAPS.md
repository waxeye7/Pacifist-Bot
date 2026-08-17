# Starvation traps — the 2026-08-17 stability pass

**Why this file exists:** five separate bugs found in one session turned out to
be the *same mistake*, made independently in five places by different pieces of
code. Naming the pattern is worth more than the five fixes, because the sixth
instance is probably already written.

---

## The pattern

> **A gate that decides whether a room may do something judges the room by a
> number that goes down *because* the room is doing things.**

Every instance had the same three properties:

1. **The signal is transient.** `room.energyAvailable` is the instantaneous
   extension fill, not what a room can afford. It falls every time the room
   spawns anything and climbs back at whatever rate the haulers manage. It says
   nothing about solvency.
2. **The gate is load-bearing in the closed direction.** These are not "skip
   this optional work" gates. Closing them force-disables remotes, recalls
   crews, blocks construction, or refuses to spawn.
3. **Closing the gate makes the signal worse, not better.** No remotes → less
   income → still poor → still closed. There is no path out from the inside.

The result is a room that looks healthy in every individual check and is
nevertheless dying, which is exactly why it took a live-server audit rather
than reading the code to find them.

---

## The five instances

| Where | The gate | What it actually did |
|---|---|---|
| `War/kit.ts` `pickHome` | `room.energyAvailable < minEnergy`, and `minEnergy` was **1** for quads, duos and CCKs | Picked the empire's only RCL6 — storage 0, both towers dry, 24/37 extensions empty — as the home for every offensive in range. 11.6k of military queued in front of the fillers that were the only cure. |
| `rooms.spawning.ts` `homeEconomyStarved` | `homeMiners < 2` | A one-source room can never reach two home miners, so it was permanently "starved" — and this predicate *force-closes every remote*. VPS W2N1/W1N2 (1 source, RCL7, storage 0) had every remote disabled forever. |
| `rooms.spawning.ts` `homeEconomyStarved` | `room.energyAvailable < 300` | Same predicate, second clause. A bootstrap test applied to every room, so any RCL7 caught mid-spawn tore down its own remote fleet. |
| `utils/PlanV2.ts` `maxSitesFor` | bank `< 80000` at RCL7 → **0 construction sites** | Rooms below the floor could never build the extensions that would let them earn more. Aimed at rooms over-building on labs/nukers; hit rooms that had never finished their energy network. |
| `utils/CpuPolicy.ts` `allowRemotes` | `avg < limit - 4` **and** `bucket >= 5000` | Double-counted the safety margin. A bot that settles at 16-18 of a 20 limit can never satisfy it; remotes latch off empire-wide, and closing remotes lowers *income*, not CPU. |

---

## What a correct gate looks like here

- **Judge solvency by the bank** (`storage` + `terminal`), not by
  `energyAvailable`. The bank is the only number that means "can afford".
- **Scale the requirement to the actual cost.** `War/kit.ts` asked whether a
  room could afford a 650-energy guard and then queued a 3170-energy raid;
  costs now live in `KIT_COST` and every call site names the kit it will issue.
- **Make the rule monotone in the resource.** More bucket must never mean more
  restrictive, or the gate oscillates and each flip recalls a fleet. See the
  `headroomMargin` ladder in `CpuPolicy` and its property test in
  `test/unit/cpuPolicy.test.ts`.
- **Ask whether the room can escape.** If closing the gate removes the room's
  only route to satisfying it, the gate needs an exception — `maxSitesFor`'s
  `coreBuildoutIncomplete`, `homeEconomyStarved`'s `min(2, localSources)`.
- **Scale thresholds to the room, not to a constant.** `< 300` means something
  in a 300-capacity room and nothing in a 4300-capacity one.

---

## Two more traps from the same session (different shape, same invisibility)

**`utils/Logger.ts` — a latch that outlived its subject.** The console gate
patched `console.log` once per global behind an `installed` flag. The Screeps
runtime installs a *fresh* `console.log` every tick (it closes over that tick's
message buffer), so from tick 2 until the next global reset the gate was simply
gone. `Memory.verbose = false` had been doing nothing, and live was printing 4+
lines per tick at 19-22 CPU against a limit of 20. Fixed by comparing against
the wrapper we installed rather than a boolean.

> Generalise: **never latch on "did I do this?" when the thing you did can be
> replaced by someone else.** Latch on "is my change still there?"

**`Functions/creepFunctions.ts` — caching the wrong layer.** All 13 cost-matrix
builders opened with the same 50x50 terrain loop (5000 engine calls) and
`getCachedCostMatrix` memoised only the finished matrix, *for the current tick*.
Room terrain is immutable for the life of a shard; it was being recomputed per
key, per room, per tick. Now built once per (room, weights, edge) and cloned —
`terrainBaseMatrix` in `utils/RoomCache.ts`. Measured on live shard3: creeps
phase 22.2 → 12.5 CPU, and the bucket turned from draining to climbing.

> Generalise: **cache at the lifetime of the data, not the lifetime of the
> caller.** The per-tick cache was hiding how bad the per-tick cost was.

---

## Reading the bot from outside

Three read-only tools were added because diagnosing the above from the console
alone was not practical:

```
node tools/server/audit.mjs --dest main --shard shard3   # per-room state + findings
node tools/server/console-tail.mjs --dest vps --seconds 60   # live log/error stream
node tools/server/exec.mjs --dest main --file probe.js       # run a probe, read the result
```

`exec.mjs` stages its source through `Memory.__src` because the console endpoint
caps expression size, and both the source and the result carry a per-run nonce —
without that, a probe that outruns its poll window leaves its answer behind and
the *next* invocation reads it as its own. That cost twenty minutes; do not
remove the nonce.

`main.ts` also emits a `[hb]` heartbeat every 100 ticks (offset off the busy
`%100` tick) naming any room with a stalled queue, a dry tower, an empty bank at
RCL4+, or a downgrade timer under 5000. With the log gate working again, a
healthy bot is otherwise completely silent — which is indistinguishable from a
dead one.

---

## Deliberate settings that look like bugs

- **Local server, 9 of 11 rooms idle with zero creeps.** That is
  `Memory.speedrun.skipHighRcl = true` — the campaign freezes RCL6+ rooms so the
  benchmark ticks faster. Working as configured. Those rooms *will* slowly
  downgrade; that is the cost of the setting, not a fault.
- **Towers sitting at ~24%.** `TOWER_FLOOR` (200) is a floor, not a fill: a
  tower is topped to 200 ahead of the extension network and then goes back to
  last in line. It fills the rest once the room is rich enough that spawn and
  extensions are full.
