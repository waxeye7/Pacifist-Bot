# Cycle-18 E11S6 — L2 p frozen 6861, then DG×2

`run-2026-08-16T06-22-16Z` · `cycle-18-rcl3-haul` · seed0 **4850955** · e2 **2835**.
redis `memory:pacifist1` + mongo `rooms.objects` + `users.code` + `users.notifications`.
Probes **4885395 / 4885927 / 4886384 / 4886796** · elapsed **~35.4–35.8k / 40000**.
No `push-race`. No seed. No src edit.

**Cause of the freeze:** HOL-exempt `[5W,M]` sat at fill **54–237** (`-6`); leftover **1W** so dest cheap-miner (`liveMiners===0`) did not fire; far src dark. Same shape as `_cycle17-l2-stall.md` / `_cycle18-stall.md`. ttd died. **Not** missing dest heal — dest has the old gate.

## Dest — cheap-miner **IS** in dest `pacifist`

Requested “not in race dest” is **false** for the candidate binary.

| dest | user / branch | `users.code` ts | cheap-miner |
| --- | --- | --- | --- |
| **`pacifist`** (cand) | `pacifist1` main active | **2026-08-16T06:22:04Z** (seed-clean `push-pacifist`) | **yes** `liveMiners===0` → `[2W,M]`/`[W,M]` |
| `race` (ctrl) | `pacifist-race` main | 2026-08-01 (`e839fc8`) | **no** |

Dest snippet (`modules.main`):

```
if (liveMiners === 0) {
  room.memory.spawn_list[0] = room.energyAvailable >= 250
    ? [WORK, WORK, MOVE] : [WORK, MOVE];
  console.log("cheap miner head — leftover-5 blackout", room.name);
}
```

Src harden `homeWork < 4` (**not** dest): `homeWork` / `WORK<4` **absent** in dest blob. Leftover 1W is a blackout on dest. Control dest has neither.

## Clocks

| event | tick / wall | note |
| --- | --- | --- |
| seed E11S6 | 4851186 / 06:22:41Z | pair B4 vs ctrl E8S3 |
| first L2 | 4854021 · e2 **2835** | ctrl e2 1725 |
| freeze | film 4879k–4881k | **p=6861** all probes · 1W + 5W head |
| warn 3k (count=2) | 07:17:48Z | second cycle |
| **DG L1** (count=2) | 07:24:12Z | leftover p kept |
| **re-L2** (count=2) | 07:26:54Z | leftover p → instant 2 |
| now | 4886796 · e **~35.8k** | **L2 p=11065** climbing |

Two full L2→L1→L2 wraps (notif `count=2`). Progress is leftover, not a reset. Ledger lastSeen 4884960 **L1 p=7041** is the second DG, not a poll mix.

## Memory (`pacifist1` tick **4886384**)

`spawn_list` **[]**. `spawnStall` **0** (`spawnStallName` null).
`lastTimeSpawnUsed` 4886315 · age **69**. `lastShrink` 4884860 · age 1524. `lastInterleave` 4885802 · age 582.

| source | tile | `pathLength` | `fiveWQueued` | `lastSpawn` | age |
| --- | --- | ---: | --- | ---: | ---: |
| `…032ab` | **46,3** far | **24** | **true** | 4885033 | 1351 |
| `…032ac` | **30,21** near | **4** | **true** | 4885784 | 600 |

`lastSpawn` = queue stamp, not hatch. Latch flag **held** both src. No flood.

## Live (mongo tick **4886796**)

L **2** / p **11065** / ext **5 / 550** leftover-5 **HOLD** · `energyAvailable` **550** (spawn 300 + ext 250).
0 roads / 0 sites. Boxes 25,19=445 · 25,20=44 · 22,23=0 · 15,24=0. Spawn 25,21. `downgradeTime` 4896627 (~9.8k).

| miner | body | sit | src | WORK |
| --- | --- | --- | --- | ---: |
| `…4410491` | **2W1M** | 47,4 mining | 46,3 far | 2 |
| `…1415031` | **5W1M** | 29,20 mining | 30,21 near | 5 |
| `…4665641` | **5W1M** | 47,4 mining | 46,3 far | 5 |

Live miner WORK **2+5+5**. Far overlap = lastSpawn aged past 1500 after the 1W died, then 5W finally filled. 6 upgraders + 4 CA + filler + repair. 15 creeps.

### Freeze film (from `_cycle18-stall.md`, p **6861**)

1W `[W,M]` at **26,20** (spawn-adj), `sourceId` 30,21, **not walking**. Both src **3000**. fill **54–237**. Head **`[5W,M]` 550** + 4C + 2W-up. stall **2–76** EM. `lastUsed` **~6576** stale. Cheap-heal gated (`liveMiners=1`).

## Glance

### E16S9 — still the 1W hole

L **3** / p **15259 frozen** (ledger ~15.1k; e3 **13439**). leftover-5 **HOLD** 5/550.
Live miner **1W** `…2938094` walking spawn **36,30** → src **44,33** (`…033a7`). Both src **3000**. Far **22,18** dark.
Mem @4886384: head **`[4W,C,M]`** upgrader, stall **2**. Earlier probe stall **489** on **`[5W,M]` 550**. `fiveWQueued` **true** both (`L=24 / 8`). `lastUsed` age **1507**.
fill **300**. tower **0e**. roads **33 / 8** sites (pave live). 5 creeps. Dest heal cannot fire (`liveMiners=1`). Src `homeWork<4` would.

### E18S5 — unstuck, now L3

Was L2 **6029** (snap) → **10458** (stall film) → **26618** (user) → **43650** then **L3**.
Notif: **DG L1 07:10:06Z** → re-L2 **07:10:21Z** → **L3 07:28:26Z**. Now L3 p **1572**.
Live **1×5W** `…1407108` walking to **9,21** (`…033f0`). Other 5W dead. Both src **3000**.
fill **500**. stall **25** on `[W,2C,2M]` builder. `fiveWQueued` **true** both (`L=13 / 2`). leftover-5 **HOLD**.
0 standing roads. L3 gate just opened: **8** road sites + tower + box. Recovered the same way as E12S3: leftover died, fill lucked 550, 5W hatched.

## Hypothesis

| claim | film |
| --- | --- |
| cheap-miner not in race dest `pacifist` | **false** — dest has `liveMiners===0` since seed 06:22Z |
| src `homeWork<4` in dest | **false** — dest blob has no `homeWork` |
| dest `race` has cheap-miner | **false** |
| leftover 1W blocks dest heal | **yes** — E11S6 freeze + E16S9 still |
| HOL-exempt 5W + leftover-5 = 550 never fills | **yes** until leftover dies |

E11S6 is off 6861 because the 1W died, dest heal queued 2W, then 550 filled and 5W hatched — **after two DG wraps**. E16S9 has not had that luck. Not KEEP / SEND BACK (pile).

Did: redis `memory:pacifist1` + mongo objects + dest `users.code` grep + notifications. Did **not**: push-race, seed, reset, git push, unclaim, SSH, src edit.
