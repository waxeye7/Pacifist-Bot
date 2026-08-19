# RCL4 construction cadence (100 vs 1000)

Read-only rec. No src edit. Fast-loop clock: spawn → RCL4 (stops the tick `controller.level` becomes 4). True north: spawn → RCL8.

**One line:** the 1000-tick gate is **off the spawn→RCL4 clock**. It **is** leftover-5 *release* and RCL4→5 / 8W. The one-knob `until storage exists, interval=100` is the same `young` predicate already used to *call* `placeFromBasePlan` — it almost does not move leftover-5 dump.

**Correction (cycle-15 E13S7):** leftover 15 are **not** after `room.storage`. Same `construction()` as the storage *site*: BasePlan 7 + checkerboard 8, because `findStorage()` is the hub container. 15 ext sites at 0 while the box is still a site (`_next-rcl4-release.md`, `_cycle15-rcl4.md`). Until-storage interval=100 still dies the tick the box *stands* — the dump has already happened.

---

## Live gate

`src/Rooms/rooms.ts`:

```
placeFromPlanV2 every 15t if planV2          // cheap FIND; independent of the gate
constructionInterval = lvl < 4 ? 100 : 1000
construction() if (time % interval == 0 && bucket > 3500)
            || DOB == 2 || DOBug == 2
Situational_Building every tick              // legacy storage smash only
```

Comment on the 15-tick loop already names the failure mode: *at RCL4+ that cadence meant ~4 structures per 1000 ticks.* That bypass exists only for `planV2`. Race rooms have no pack (`REPORT-2026-08-16.md`, `_SURFACE.md` #6, overnight). Leftover-5 KEEP was the *legacy* close (`extensionTake` in `placeFromBasePlan` + checkerboard).

`young` is already `lvl < 4 || !room.storage` (`rooms.construction.ts`). Interval uses only `lvl < 4`. After leftover-5, RCL4 is the first level that both (a) needs a big site burst (storage 30k + 15 ext) and (b) waits 1000.

---

## Clock

`trackRoomRcl` stamps `rclTimes[4]` the first tick `level === 4` (`Speedrun.ts`). Race `--target-rcl 4`. Storage, leftover-5 sites, fillers, 8W are all **after** that stamp (`_SURFACE.md` “after the clock”, `_rcl3-instant-steelman.md` channel 3, `_ext-payback.md`).

A 0–999 tick wait to *site* storage/ext **cannot** change mean spawn→RCL4. It can change leftover-5 release, time-to-storage-standing, 8W, spawn→RCL5, spawn→RCL8.

---

## What actually fires at the RCL4 tick

`data()` (`rooms.data.ts`): `progress <= 200` pins `DOBug = 0` then `+= 1` → stuck at **1**. RCL-up resets progress to 0, so the first ~201 controller energy of *every* level including 4 does this. `DOB` is never reset; `DOB == 2` is room-birth only.

When progress crosses 200 (~10 t at 5×4W = 20 e/t):

| tick after 200 | what |
| ---: | --- |
| 0 (`DOBug==2`) | `construction()` **once**, no bucket check |
| +1 (`DOBug==3`) | `Situational_Building`: smash container at `spawn.y-2` (no `planV2`) |
| +2 (`DOBug==4`) | site storage at `spawn.y-2` |

Then the only `construction()` trigger is `Game.time % 1000 == 0 && bucket > 3500`.

So **first** storage/ext sites are **not** waiting 1000. They land ~10–12 t after RCL4 on the legacy path (DOBug one-shot + smash). The 1000 is the **refill**.

---

## Two paths after leftover-5

`extensionTake` jumps 5 → engine 20 the tick of RCL4. Policy: storage first, then the deferred 5 + ten new (`_rcl4-ext-when.md`, `_ext-policy.md`). `_ext-policy.md` said that dump rides the **15-tick cadence**. That sentence is true only for `planV2`.

### planV2 (not this race set)

`maxSitesFor`: 4 until `room.storage.my`, then 8. `PLACE_ORDER`: spawn → storage → tower → container → **extension**. 15-tick recycle. Interval is irrelevant. Already solved.

### Legacy / race (the leftover-5 KEEP set)

`placeFromBasePlan` only while `young` (`lvl < 4 || !storage`), `maxSites=8`, stop at 10 live sites. Order: storage, skip container at RCL≥4, **extension** (`extensionTake` = 20). Does **not** wait for `storage.my`.

`DOBug==2` pass: storage site + up to 7 ext. `findLocked` then prefers storage/link over those ext (`builder.ts`), so the 30k is built first; the 7 ext sit at 0 progress.

After `room.storage` exists: `young` flips off. Leftover ext come from checkerboard `pathBuilder` **inside the same `construction()`**, now on the 1000-tick gate.

During the 30k the room is already near the 10-site cap (storage + 7–9 ext). Extra `construction()` calls in that window add at most 2 sites. The refill that matters is **after storage completes**: each finished ext frees a slot that sits empty until the next `% 1000`.

15 remaining ext, 2×1W builders (~10 progress/t): first 7–9 are pre-queued (~2.1–2.7k t). Remaining 6–8 wait a 1000-tick refill (avg ~500, worst ~999) per batch. That is the leftover-5 *release* tax. Cycle-9 no-RCL3-roads KEEP is why those slots are free at all (`_rcl3-sites-roads.md`: 4 leftover roads ⇒ `budget = 0`, storage never sites).

---

## The proposed knob

```
constructionInterval = (lvl < 4 || !room.storage) ? 100 : 1000
```

Same predicate as `young`. One line in `rooms.ts`.

| | spawn→RCL4 | first storage/ext site | refill during 30k | leftover-5 dump after `storage.my` | RCL5 controller | time-to-8W |
|---|---|---|---|---|---|---|
| live (`lvl<4`) | 0 | ~10 t (DOBug) | 1000 | **1000** | — | 1000 after box |
| **until storage** | **0** | 0 (already ~10 t) | 100, but slots already full | **still 1000** (knob just turned off) | ~0 | **still 1000** |
| `lvl < 5` | 0 | 0 | 100 | **100** | tiny later (builders busier) | 100 |
| cheap: `placeFromBasePlan` every 15 t while `young` **or** `lvl===4 && ext<20`; leave `construction()` at 1000 | 0 | 0 | 15 | 15 if the cheap call stays after storage | tiny later | 15 |

**Until-storage does not help leftover-5 release.** Policy wants the 15 *after* the box; the knob is 1000 from that tick. During the 30k it maybe pre-queues +2 ext (8 → 10). That is the whole effect.

**RCL5:** `CONTROLLER_LEVELS[4]=405k`. Storage 30k + 15×3k=45k sit on this climb, not the 135k (`_ext-payback.md`: leftover-5 on the 405k is 750 t at 20 e/t). Faster *siting* keeps builders busy → energy off the controller → RCL5 *progress* a bit later, box+cap sooner. Delaying leftover-5 *sites* is the same leftover-5 logic that already won RCL4 (15k later ⇒ controller sooner). 8W is `getBody([4W,C,M])×2=1000` → cap ≥1177 → **18 ext**, leftover-5 **plus** most of the ten new, **after** storage (`_rcl4-ext-when.md`). The cadence that unlocks 8W is the post-storage refill. User's knob does not cover it.

CPU: `construction()` is the expensive path (`getBasePlan` is cached after first compute; the rest is still PathFinder / checkerboard / labs). `lvl<5 ? 100` is ~4k extra calls over the 405k. The 15-tick comment in `rooms.ts` already says: don't run that more often; run the cheap placer.

---

## Rec

- **Not a spawn→RCL4 A/B.** Do not spend a fast-loop cycle. Park with storage floors / fillers (`_SURFACE.md` “after the clock”).
- **Until-storage, interval=100: do not ship as the leftover-5 / RCL5 knob.** First site is already the DOBug one-shot. Dump-after-storage is exactly when the knob dies.
- If true-north RCL4→5 / 8W is next, one knob, still not bundled with `extensionTake` (KEEP):
  1. **Prefer:** call `placeFromBasePlan` on the 15-tick tick when `young || (lvl===4 && ext<20)`, leave `construction()` at 1000. Same idea as the existing planV2 bypass; race rooms are the hole.
  2. **Acceptable one-liner:** `lvl < 5 ? 100 : 1000`. Hits the dump window. Pays CPU on the expensive function.
- Do not `push-race`. Do not `server:local:reset`. Leftover-5 take stays 5 through RCL3.

## Model Δ (not a race number)

| metric | until-storage | `lvl<5` / 15 t dump |
|---|---|---|
| spawn→RCL4 | **0** | **0** |
| time-to-storage-site | 0 | 0 |
| time-to-storage-standing | ~0 (`findLocked` already prefers the box) | ~0 |
| leftover-5 *sites* after box | **0** (gate is 1000 again) | **−0.5k…−2k** idle-slot tax on the remaining 6–8 ext |
| spawn→RCL5 (controller only) | 0 | 0 to **+**small |
| time-to-8W / 20 ext | ~0 | **−0.5k…−2k** |
