# Cycle-15 `fiveWQueued` — remaining flood / HOL

Read-only. Do not edit `src`. Do not `push-race`. Cycle-15 is already watching (`_SPEEDRUN-STATE.txt`: `run-2026-08-15T23-57-10Z`).

Line numbers are `rooms.spawning.ts` unless noted.

---

## What cycle-15 does

Cycle-13: `values.lastSpawn = 0` every producer pass while a 2W was live → ~1 extra miner per spawn cycle (`spawn_list` empty + `lastTimeSpawnUsed == 2` at `:129`, then `% 20` at RCL≤5) → 15 miners/source.

Cycle-14: skip if any live miner had `WORK >= 5`. `clampSpawnListToCapacity` (`:168`) shrinks the 550 `[5W,M]` to `[4W,M]` (below). Full never tripped. 14 miners.

Cycle-15 latch (`:4266–4281`) + flag (`:4360–4361`):

```
home && cap >= 550 && !values.fiveWQueued
  && Game.time - lastSpawn <= 1500
  && !queuedForSource(EnergyMiner)
  && some live miner getActiveBodyparts(WORK) < 5
  && src.pos.getOpenPositions().length > 0
    → lastSpawn = 0

# then the existing 1500 gate (:4284) unshifts the 550 body and:
values.lastSpawn = Game.time
values.fiveWQueued = true          # only on the home >=550, <750 path
```

The gun is still `lastSpawn = 0`. The flag is the safety. `Game.time - 0 > CREEP_LIFE_TIME` is true on this seed (~3e6).

---

## 1. Can `fiveWQueued` fail to persist?

**Home `values` is sticky for the life of the room. A mid-race wipe of the flag is not the live path.**

`values` is `Memory.rooms[home].resources[home].energy[sourceId]`.

| writer | what it does to home `energy[id]` |
|---|---|
| `identifySources` (`rooms.ts:649–665`) | `_.set(..., {})` only when that id is `undefined`. Runs `% 10`. Once the object exists, fields stay. |
| `remotes()` | `resources[home] = {}` only if the home key is missing. Called *after* the `_.set` on first init. Does not replace an existing home entry. |
| `manageRemotes` | `if (n !== room.name)` for every close / `energy = {}`. Home is skipped. |
| `scout.ts:78` | `energy[source.id] = {}` — **full replace**. Scout target is `remoteRoom !== room.name` (`:2170`). Never home. |
| `rooms.ts:434–439` | `delete Memory.rooms[name]` on invisible / RCL0. Owned home is always visible. |

So the flag dies only on: full Memory wipe, `delete Memory.rooms[home]`, or reclaim. After that `values` is a new `{}` (`fiveWQueued` undefined, `lastSpawn` 0).

**New `{}` on this seed (Game.time ≫ 1500):** latch requires `Game.time - (lastSpawn\|\|0) <= 1500`. `Game.time - 0` is millions → latch does **not** fire. The 1500 gate (`:4284`) queues **one** miner (correct bootstrap). Not a flood.

**New `{}` on a tick-0 world (Game.time < 1500):** opposite. Latch *does* fire (`Game.time - 0 <= 1500`). 1500 gate does *not* (`Game.time - 0 > 1500` is false), so `fiveWQueued` is **never written**. Then `:4472` `!lastSpawn && Game.time < 1500` unshifts a `[2W,M]` every producer pass (`0` is falsy). That is the cycle-13 flood on a fresh private server. Inert on seed ~3.12e6 (`_next-rcl1-bootstrap.md`).

Global reset keeps Memory. Heap is not involved.

---

## 2. Can clamp shrink and re-queue another path?

**Shrink: yes, every time, at the race cap. Re-queue: no, if the flag stuck.**

`EnergyMiner` is routine (`:298–301`) → budget `floor(cap * 0.85)` (`:217`). Upgrader is exempt at `hardCap <= 550` (`:221–223`). Miner is not.

At slam-5 / leftover-5, cap is **550**. `[5W,M] = 550`. `0.85 * 550 = 467`. `shrinkQueuedBody` (`:376–398`) drops WORK to the floor of 2: one drop → `[4W,M] = 450`. Clamp runs the same tick as the producer (`:146–147`), so the head the spawn sees is already 450.

Order: `unshift` 550 → `fiveWQueued = true` → `clamp` mutates the body in place (opts/`sourceId` kept). `queuedForSource` (`:3893`) still sees it. Next pass the flag blocks `:4281`. After hatch the live miner is 4W; flag still blocks. After `lastSpawn` ages out (~1500) the 550 path queues again; clamp shrinks again.

**The race window never hatches a 5W.** Need `550 <= 0.85 * cap` → cap ≥ **647** (7 ext). Leftover-5 holds 5 ext. After the 2W dies you sit on **8 e/t**, not 10.

Dropped (not shrunk) 5W: flag stays, `lastSpawn` recent, 2W still `onTheWay` → no re-queue (miss, not flood). If the 2W is also gone, self-heal (`:4250`) zeros `lastSpawn` and the 1500 gate queues one more. Fine.

`spawn_list = []` idle wipe (`:46`) is the same as a drop.

---

## 3. `fiveWQueued` is never set — flood still live

The flag is written **only** on the home `550 <= cap < 750` path (`:4346–4361`).

**`cap >= 750` (`:4301–4343`)** stamps `lastSpawn` only. Latch stays armed.

Then `getActiveBodyparts(WORK)` (`:4278`) is **0 while the creep is spawning** (engine). `homeSourceHarvest` (`:3636`) already refuses that API and counts `c.body`. The hatchling sits in the spawn, so `getOpenPositions` on the source is still > 0.

Timeline at cap ≥ 750:

1. Latch zeros `lastSpawn` → 750 body unshifted, no flag.
2. `queuedForSource` holds until `spawnCreep` consumes the triple.
3. Producer T+2 (`:129`) while it hatches: flag false, `lastSpawn` recent so latch predicate is true, `getActiveBodyparts == 0` → tiny, seats > 0 → `lastSpawn = 0` → another 750 body.

One extra per spawn cycle for the whole hatch. After hatch, 6W is not tiny — stops.

**Unless clamp cut it below 5W.** `[2M,6W,M] = 750`. At cap 800, 85% = 680 → one WORK drop → 5W, OK. At cap **750** (9 ext), 85% = 637 → drops to **4W+3M**. Live WORK is 4 forever → cycle-14 flood is back. Leftover-5 rooms never sit at 750; a leak-to-10-ext room sits at 800 (safe after hatch). Not the current race cap.

RCL7 body on the 550 path is `[4W,C,M]` (`:4347`) but **does** set the flag. No flood; we latch a 4W as “the 5W”.

---

## 4. Seats can make the knob a no-op

`:4280` uses `getOpenPositions` (`roomPositionFunctions.ts:29`), which drops tiles that already have a creep. The sitting 2W occupies a seat.

A 1-open-tile source with the 2W already adjacent → `seats == 0` → never zero `lastSpawn` → no overlap 5W/4W at all. Use `getOpenPositionsIgnoreCreeps` (or “already adjacent counts as a seat”) if the upgrade must fire on tight sources.

---

## 5. Remotes

Latch is `targetRoomName == room.name` only. Remotes do not set `fiveWQueued`.

Remotes are closed below RCL4 (`:1264–1280`, `manageRemotes`). The spawn→RCL4 clock never sees this path.

Re-scout does `energy[source.id] = {}` (`scout.ts:78`) — wipes `lastSpawn` / `pathLength` / `lastSpawnCarrier`. Next producer: `Game.time - 0 > 1500` → **one** extra remote miner (live miner does not block the 1500 gate; only `queuedForSource` does). Not a per-tick flood. `e.energy = {}` when someone owns the room (`rooms.remotes.ts:329`) also `active = false`, so `spawn_energy_miner` skips.

Remote lastSpawn is a walk-lead (`:4443`, `:4451`) or `Game.time-650`, not the 5W overlap poke.

---

## 6. HOL that is still there

- Extra miner **unshifts** (`:4356`). Jumps the queue, resets `spawnStall` / `spawnStallName` (comment at `:4256–4259`). One 18-tick HOL in front of shuttles / 4W / builders. After clamp the head is 450, not 550 — no 550-energy stall at leftover-5.
- If someone later exempts EnergyMiner from 85% so a real 5W can hatch, the head is 550 until the spawn is full. That is a new HOL. Do not bundle with a flood fix.
- Self-heal (`:4250`) can still zero `lastSpawn` when `!minerOnTheWay`. That is the blackout repair, not the overlap poke. It queues one, not fifteen.

---

## Verdict on cycle-15 as raced

On this seed, leftover-5, cap 550:

- Flag persists. 550 path writes it. **Per-tick flood should be dead.**
- Hatch `getActiveBodyparts == 0` is covered *because* the flag is already true.
- What actually hatches is a **4W**. Model Δ vs a real 5W is “2W+4W saturate at 10 until the 2W dies, then 8 e/t until cap ≥ 647”. Cycle-15 is a 4W-overlap A/B, not a 5W A/B.
- Watch film for `clamped EnergyMiner from 550 to 450` and miner count staying at 2/source after the first extra. If you see 3+, the 750 / hatch / tick-0 holes above.

---

## One-knob safer alternative (if cycle-15 floods or you re-run)

**Stop zeroing `lastSpawn`.** That poke is the cycle-13/14 gun. Replace `:4266–4281` with a direct one-shot unshift. Leave the 1500 gate and every other `lastSpawn` stamp alone.

```ts
if (targetRoomName == room.name && room.energyCapacityAvailable >= 550
    && !values.fiveWQueued
    && !queuedForSource(room, "EnergyMiner", sourceId)) {
    let work = 0, live = 0;
    for (const name in Game.creeps) {
        const c = Game.creeps[name];
        if (!c || c.memory.role !== "EnergyMiner" || c.memory.sourceId !== sourceId) continue;
        live++;
        const body = c.body || [];
        for (let i = 0; i < body.length; i++) if (body[i].type == WORK) work++;
    }
    if (live > 0 && work < 5) {
        const newName = 'EnergyMiner-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
        room.memory.spawn_list.unshift(
            [WORK,WORK,WORK,WORK,WORK,MOVE], newName,
            {memory: {role: 'EnergyMiner', sourceId, targetRoom: targetRoomName, homeRoom: room.name}});
        values.fiveWQueued = true;
        // do not touch lastSpawn
    }
}
```

Why this and not another flag:

- `lastSpawn = 0` no longer opens `:4284` / `:4463` / `:4472` on the same pass.
- Count `c.body` WORK, not `getActiveBodyparts` — same rule as `homeSourceHarvest`. A hatching 5W is already full.
- Values wipe → at most **one** more extra (flag missing → one unshift → flag set). Not one per producer pass.
- 750 path / RCL7 4W no longer matter: this branch does not go through them.
- Skip the seats check (or switch to ignore-creeps). The 2W already on the tile is the reason we are here.
- Tick-0 world: 1500 gate still closed, but this block queues the 5W itself and sets the flag. `:4472` then sees `lastSpawn` still set by the 2W and stays quiet.

Still not a real 5W at cap 550 (clamp). That is a **second** knob: EnergyMiner budget = `hardCap` when `hardCap <= 550`, mirror the Upgrader exempt at `:221`. Do not bundle. Do not ship it on the watching run.

Do not add a “max 2 miners/source” cap in the same commit unless cycle-15 still floods — that is a third change.
